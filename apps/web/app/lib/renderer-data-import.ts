import type { DataHostOpenResult, SnapshotImportReport } from '@app/db/browser';
import {
  createAppPlatformAdapter,
  getIndexedDbBlob,
  listIndexedDbBlobKeys,
  type DesktopPlatformBridge,
  type RendererImportReport,
} from '@app/platform';
import { createAppError, err, type AppResult } from '@app/shared';
import { actionFailureMessage, failureMessage } from './app-feedback.js';
import { createIndexedDbPersistedBytesStore } from './persisted-bytes-idb.js';

// #213: the one-way move of a pre-data-host profile. The sql.js snapshot import (#210) already
// verifies the database; this coordinator moves the renderer's IndexedDB page and cover bytes
// into main's page store, has main hash the file it wrote, and only then lets the snapshot
// import rewrite cache pointers. Old bytes stay until the marker records a verified move.

const PAGE_PREFIX = 'page:';
const COVER_PREFIX = 'cover:';

/** A cache row's blob pointer, moved from an IndexedDB key to the page-store key. */
interface BlobPointerRewrite {
  readonly id: string;
  readonly blobKey: string;
}

interface BlobInventoryEntry {
  readonly key: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly sha256: string;
}

export interface BlobMoveResult {
  readonly rewrites: readonly BlobPointerRewrite[];
  readonly inventory: readonly BlobInventoryEntry[];
  readonly pages: number;
  readonly covers: number;
  readonly totalBytes: number;
}

type RendererImportStep = 'blob' | 'database' | 'pointer' | 'marker';

class RendererDataImportError extends Error {
  readonly step: RendererImportStep;

  constructor(step: RendererImportStep, message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = 'RendererDataImportError';
    this.step = step;
  }
}

/** The page-store key that replaces an old IndexedDB key. Covers gain the page prefix. */
export function pageStoreKeyForKey(key: string): string {
  return key.startsWith(COVER_PREFIX) ? `${PAGE_PREFIX}${key}` : key;
}

function isLegacyBlobKey(key: string): boolean {
  return key.startsWith(PAGE_PREFIX) || key.startsWith(COVER_PREFIX);
}

export interface BlobMoveDeps {
  readonly listKeys: () => Promise<readonly string[]>;
  readonly readBlob: (
    key: string,
  ) => Promise<{ readonly data: ArrayBuffer; readonly mimeType: string } | undefined>;
  readonly putBlob: (
    key: string,
    data: ArrayBuffer,
    mimeType: string,
  ) => Promise<AppResult<string>>;
  readonly verifyBlob: (
    key: string,
  ) => Promise<AppResult<{ readonly sha256: string; readonly byteSize: number } | undefined>>;
  readonly sha256: (bytes: Uint8Array) => Promise<string>;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // A fresh ArrayBuffer keeps the digest call typed for Uint8Array<ArrayBufferLike>.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Copies every page and cover blob to the page store under its target key and verifies that
 * main stored exactly the source bytes. Any failure throws and leaves every old blob in place:
 * cached pages and covers may be refetched, but a custom cover's bytes are never discarded.
 */
export async function moveRendererBlobs(deps: BlobMoveDeps): Promise<BlobMoveResult> {
  const keys = (await deps.listKeys()).filter(isLegacyBlobKey);
  const rewrites: BlobPointerRewrite[] = [];
  const inventory: BlobInventoryEntry[] = [];
  let pages = 0;
  let covers = 0;
  let totalBytes = 0;

  for (const key of keys) {
    // One blob at a time: each is moved and verified before the next, so a failure names a
    // single source and a large profile is never held in memory whole.
    // oxlint-disable-next-line eslint/no-await-in-loop
    const record = await deps.readBlob(key); // react-doctor-disable-line react-doctor/async-await-in-loop -- sequential move is the bound and the attribution
    if (record === undefined) continue;
    const targetKey = pageStoreKeyForKey(key);
    const sourceBytes = new Uint8Array(record.data);
    const sourceHash = await deps.sha256(sourceBytes);

    const put = await deps.putBlob(targetKey, record.data, record.mimeType);
    if (!put.ok) {
      throw new RendererDataImportError(
        'blob',
        `Could not move the cached image "${key}": ${actionFailureMessage(put.error, 'the page store refused it')}`,
      );
    }

    const verified = await deps.verifyBlob(targetKey);
    if (!verified.ok || verified.value === undefined) {
      throw new RendererDataImportError(
        'blob',
        `The page store did not keep the moved image "${key}".`,
      );
    }
    if (
      verified.value.sha256 !== sourceHash ||
      verified.value.byteSize !== sourceBytes.byteLength
    ) {
      throw new RendererDataImportError(
        'blob',
        `The moved image "${key}" does not match its source bytes.`,
      );
    }

    if (targetKey !== key) rewrites.push({ id: key, blobKey: targetKey });
    inventory.push({
      key: targetKey,
      mimeType: record.mimeType,
      byteSize: sourceBytes.byteLength,
      sha256: sourceHash,
    });
    totalBytes += sourceBytes.byteLength;
    if (key.startsWith(COVER_PREFIX)) covers += 1;
    else pages += 1;
  }

  return { rewrites, inventory, pages, covers, totalBytes };
}

interface RendererImportMarkerState {
  readonly completed: boolean;
  readonly completedAt?: string;
  readonly database: SnapshotImportReport | null;
}

export interface RendererImportDeps {
  readonly markerState: () => Promise<AppResult<RendererImportMarkerState>>;
  readonly recordComplete: (report: RendererImportReport) => Promise<AppResult<void>>;
  readonly blobs: BlobMoveDeps;
  readonly snapshot: Uint8Array | null;
  readonly openHost: (
    snapshot: Uint8Array | null,
    rewrites: readonly BlobPointerRewrite[],
  ) => Promise<AppResult<DataHostOpenResult>>;
  /** Rewrites pointers in an already-imported native database (a #210 profile). */
  readonly rewritePointers: (rewrites: readonly BlobPointerRewrite[]) => Promise<number>;
  /**
   * The marker records a database that no longer exists on disk: the verified state was lost,
   * so the move and the snapshot import run again instead of trusting the marker.
   */
  readonly force?: boolean;
}

export type RendererDataImportOutcome =
  | { readonly status: 'skipped' }
  | {
      readonly status: 'complete';
      readonly report: RendererImportReport;
      readonly openResult: AppResult<DataHostOpenResult>;
    }
  | {
      readonly status: 'failed';
      readonly failure: RendererDataImportError;
      readonly hostOpened: boolean;
      readonly openResult: AppResult<DataHostOpenResult> | null;
    };

type RendererImportPhase = 'idle' | 'running' | 'complete' | 'failed' | 'skipped';

export interface RendererImportUiState {
  readonly phase: RendererImportPhase;
  readonly errorMessage: string | null;
  readonly report: RendererImportReport | null;
}

let uiState: RendererImportUiState = { phase: 'idle', errorMessage: null, report: null };
const listeners = new Set<() => void>();

function setUiState(next: RendererImportUiState): void {
  uiState = next;
  for (const listener of listeners) listener();
}

export function getRendererImportState(): RendererImportUiState {
  return uiState;
}

export function subscribeRendererImport(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Clears a failure before a user-initiated retry reopens the database. */
export function resetRendererImportState(): void {
  if (uiState.phase === 'failed') setUiState({ phase: 'idle', errorMessage: null, report: null });
}

/**
 * Runs the move once: verifies every blob, then lets the snapshot import copy the database
 * with the pointers already rewritten, verifies the database, and finally records the marker.
 * A failure before the host opens leaves no native file, so the window keeps its sql.js data.
 */
export async function runRendererDataImport(
  deps: RendererImportDeps,
): Promise<RendererDataImportOutcome> {
  const marker = await deps.markerState();
  if (!marker.ok) {
    const failure = new RendererDataImportError(
      'marker',
      actionFailureMessage(marker.error, 'The import status could not be read.'),
    );
    setUiState({ phase: 'failed', errorMessage: failure.message, report: null });
    return { status: 'failed', failure, hostOpened: false, openResult: null };
  }
  if (marker.value.completed && deps.force !== true) {
    setUiState({ phase: 'skipped', errorMessage: null, report: null });
    return { status: 'skipped' };
  }

  setUiState({ phase: 'running', errorMessage: null, report: null });

  const movedResult = await moveRendererBlobs(deps.blobs).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (!movedResult.ok) {
    const failure =
      movedResult.error instanceof RendererDataImportError
        ? movedResult.error
        : new RendererDataImportError(
            'blob',
            failureMessage(movedResult.error, 'The cached images did not move.'),
            { cause: movedResult.error },
          );
    setUiState({ phase: 'failed', errorMessage: failure.message, report: null });
    return { status: 'failed', failure, hostOpened: false, openResult: null };
  }
  const moved = movedResult.value;

  const openResult = await deps.openHost(deps.snapshot, moved.rewrites);
  if (!openResult.ok) {
    const failure = new RendererDataImportError(
      'database',
      actionFailureMessage(openResult.error, 'The native database could not be created.'),
    );
    setUiState({ phase: 'failed', errorMessage: failure.message, report: null });
    return { status: 'failed', failure, hostOpened: false, openResult };
  }

  // A #210 profile already had its snapshot imported, so the pointer rewrites run on the
  // open database instead of during the copy.
  const rewrote =
    openResult.value.imported === null && moved.rewrites.length > 0
      ? await deps.rewritePointers(moved.rewrites).then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error }),
        )
      : ({ ok: true as const } as const);
  if (!rewrote.ok) {
    const failure = new RendererDataImportError(
      'pointer',
      failureMessage(rewrote.error, 'The cache pointers could not be rewritten.'),
      { cause: rewrote.error },
    );
    setUiState({ phase: 'failed', errorMessage: failure.message, report: null });
    return { status: 'failed', failure, hostOpened: true, openResult };
  }

  const report: RendererImportReport = {
    database: openResult.value.imported ?? marker.value.database ?? null,
    blobs: {
      pages: moved.pages,
      covers: moved.covers,
      totalBytes: moved.totalBytes,
      checksums: Object.fromEntries(moved.inventory.map((entry) => [entry.key, entry.sha256])),
    },
    pointerRewrites: moved.rewrites.length,
  };

  const recorded = await deps.recordComplete(report);
  if (!recorded.ok) {
    const failure = new RendererDataImportError(
      'marker',
      actionFailureMessage(recorded.error, 'The verified import could not be recorded.'),
    );
    setUiState({ phase: 'failed', errorMessage: failure.message, report: null });
    return { status: 'failed', failure, hostOpened: true, openResult };
  }

  setUiState({ phase: 'complete', errorMessage: null, report });
  return { status: 'complete', report, openResult };
}

/** The desktop bridge, when this window runs inside the Electron preload. */
function desktopBridge(): DesktopPlatformBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  const candidate = (window as { mangaversePlatform?: DesktopPlatformBridge }).mangaversePlatform;
  return candidate !== undefined && typeof candidate.rendererImportState === 'function'
    ? candidate
    : undefined;
}

/** Every production dependency, bound to this window's bridge and IndexedDB. */
export function createRendererImportDeps(
  openHost: RendererImportDeps['openHost'],
  rewritePointers: RendererImportDeps['rewritePointers'],
  snapshot: Uint8Array | null,
): RendererImportDeps | undefined {
  const bridge = desktopBridge();
  if (bridge === undefined) return undefined;
  const adapter = createAppPlatformAdapter();
  return {
    markerState: () => bridge.rendererImportState(),
    recordComplete: (report) => bridge.rendererImportComplete(report),
    snapshot,
    openHost,
    rewritePointers,
    blobs: {
      listKeys: () => listIndexedDbBlobKeys(),
      readBlob: (key) => getIndexedDbBlob(key),
      putBlob: async (key, data, mimeType) => {
        const result = await adapter.blobStorage.put(key, data, mimeType);
        return result.ok ? { ok: true, value: key } : result;
      },
      verifyBlob: (key) =>
        adapter.blobStorage.verify === undefined
          ? Promise.resolve({ ok: true, value: undefined })
          : adapter.blobStorage.verify(key),
      sha256: sha256Hex,
    },
  };
}

export interface ExportedOldData {
  readonly version: 1;
  readonly exportedAt: string;
  readonly snapshot: {
    readonly version: number;
    readonly byteSize: number;
    readonly sha256: string;
    readonly base64: string;
  } | null;
  readonly blobs: readonly BlobInventoryEntry[];
}

export interface OldDataExportDeps {
  readonly readSnapshot: () => Promise<
    { readonly bytes: Uint8Array; readonly version: number } | undefined
  >;
  readonly listKeys: () => Promise<readonly string[]>;
  readonly readBlob: BlobMoveDeps['readBlob'];
  readonly sha256: BlobMoveDeps['sha256'];
  readonly now: () => Date;
}

/** The JSON an interrupted import can hand to the user: snapshot bytes and blob inventory. */
export async function buildOldDataExport(deps: OldDataExportDeps): Promise<ExportedOldData> {
  const snapshot = await deps.readSnapshot();
  const keys = (await deps.listKeys()).filter(isLegacyBlobKey);
  const blobs: BlobInventoryEntry[] = [];
  for (const key of keys) {
    // Hash one blob at a time so an export of a large profile does not hold every byte.
    // oxlint-disable-next-line eslint/no-await-in-loop
    const record = await deps.readBlob(key); // react-doctor-disable-line react-doctor/async-await-in-loop -- sequential hashing is the bound
    if (record === undefined) continue;
    const bytes = new Uint8Array(record.data);
    blobs.push({
      key,
      mimeType: record.mimeType,
      byteSize: bytes.byteLength,
      sha256: await deps.sha256(bytes),
    });
  }
  return {
    version: 1,
    exportedAt: deps.now().toISOString(),
    snapshot:
      snapshot === undefined
        ? null
        : {
            version: snapshot.version,
            byteSize: snapshot.bytes.byteLength,
            sha256: await deps.sha256(snapshot.bytes),
            base64: toBase64(snapshot.bytes),
          },
    blobs,
  };
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

/**
 * Exports what the old profile still holds: the snapshot bytes and an inventory of every
 * IndexedDB page and cover. Available while an import is failing, so no data is trapped.
 */
export async function exportOldRendererData(): Promise<AppResult<string | undefined>> {
  if (typeof window === 'undefined') {
    return err(
      createAppError({
        code: 'renderer-import.unavailable',
        message: 'The old local data is only available in the app window.',
      }),
    );
  }
  const adapter = createAppPlatformAdapter();
  const exported = await buildOldDataExport({
    readSnapshot: () => createIndexedDbPersistedBytesStore().read(),
    listKeys: listIndexedDbBlobKeys,
    readBlob: getIndexedDbBlob,
    sha256: sha256Hex,
    now: () => new Date(),
  });
  const saved = await adapter.files.saveTextFile({
    suggestedName: 'mangaverse-old-data.json',
    content: `${JSON.stringify(exported, null, 2)}\n`,
  });
  return saved.ok ? { ok: true, value: saved.value.path } : saved;
}
