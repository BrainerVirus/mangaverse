import { readFile, rename, writeFile } from 'node:fs/promises';
import { createAppError, err, ok, type AppResult } from '@app/shared';
import {
  PLATFORM_IPC,
  platformInvalidUrl,
  platformIpcRequestSchema,
  type RendererImportReport,
} from '@app/platform';
import type { IpcMain, IpcMainInvokeEvent, WebFrameMain } from 'electron';
import { toIpcAppResult } from './platform-ipc.js';

// The one-way move of a pre-data-host profile (#213). The renderer owns IndexedDB, so it
// reads and moves the blobs; main owns the files beside the database, so it records that the
// verified move happened. Nothing listens on a socket.

export const RENDERER_IMPORT_UNAUTHORIZED_FRAME = 'renderer-import.unauthorized_frame';

/** Registered here, with sender authorization, rather than by `registerPlatformIpc`. */
export const RENDERER_IMPORT_CHANNELS = [
  PLATFORM_IPC.RENDERER_IMPORT_STATE,
  PLATFORM_IPC.RENDERER_IMPORT_COMPLETE,
] as const;

/** Where the renderer-data import records its verification, beside the native database. */
export const rendererImportMarkerPath = (databasePath: string): string =>
  `${databasePath}.import-renderer.json`;

interface RendererImportState {
  readonly completed: boolean;
  readonly completedAt?: string;
  /** The database report #210 wrote when it imported the snapshot, if it did. */
  readonly database: {
    readonly tables: Readonly<Record<string, number>>;
    readonly totalRows: number;
    readonly checksum: string;
  } | null;
}

export interface RendererImportStore {
  state(): Promise<RendererImportState>;
  /** Records the verified import atomically: a crash never leaves a half-written marker. */
  complete(report: RendererImportReport): Promise<void>;
}

/** A marker that is absent, unreadable or not JSON names no import. */
function readJson(path: string): Promise<unknown> {
  return readFile(path, 'utf8')
    .then((raw) => JSON.parse(raw) as unknown)
    .catch(() => undefined);
}

interface DatabaseMarker {
  readonly tables?: unknown;
  readonly totalRows?: unknown;
  readonly checksum?: unknown;
}

function asDatabaseReport(value: unknown): RendererImportState['database'] {
  const marker = value as DatabaseMarker | null;
  if (
    typeof marker?.tables !== 'object' ||
    marker.tables === null ||
    typeof marker.totalRows !== 'number' ||
    typeof marker.checksum !== 'string'
  ) {
    return null;
  }
  return {
    tables: marker.tables as Readonly<Record<string, number>>,
    totalRows: marker.totalRows,
    checksum: marker.checksum,
  };
}

export function createRendererImportStore(databasePath: string): RendererImportStore {
  const markerPath = rendererImportMarkerPath(databasePath);
  const databasePathMarker = `${databasePath}.import.json`;
  return {
    async state() {
      const [databaseMarker, marker] = await Promise.all([
        readJson(databasePathMarker),
        readJson(markerPath),
      ]);
      // A fresh profile without a snapshot import has no marker; that is not a failure.
      const database = asDatabaseReport(databaseMarker);
      if (marker === undefined) return { completed: false, database };
      const completedAt = (marker as { completedAt?: unknown }).completedAt;
      return {
        completed: true,
        ...(typeof completedAt === 'string' ? { completedAt } : {}),
        // #210's own marker wins; a fresh profile that never imported a snapshot still
        // records what this marker verified.
        database: database ?? asDatabaseReport((marker as { database?: unknown }).database),
      };
    },
    async complete(report) {
      const temporary = `${markerPath}.tmp`;
      await writeFile(
        temporary,
        `${JSON.stringify(
          { version: 1, completedAt: new Date().toISOString(), ...report },
          null,
          2,
        )}\n`,
      );
      await rename(temporary, markerPath);
    },
  };
}

export interface RendererImportIpcDeps {
  readonly ipcMain: Pick<IpcMain, 'handle'>;
  readonly store: RendererImportStore;
  /** The data host's check: the main frame of a window main created, on the app's origin. */
  readonly isTrustedFrame: (frame: WebFrameMain | null) => frame is WebFrameMain;
}

export function registerRendererImportIpc(deps: RendererImportIpcDeps): void {
  const refuse = () =>
    toIpcAppResult(
      err(
        createAppError({
          code: RENDERER_IMPORT_UNAUTHORIZED_FRAME,
          message: 'This frame may not read the import state.',
        }),
      ),
    );

  deps.ipcMain.handle(
    PLATFORM_IPC.RENDERER_IMPORT_STATE,
    async (event: IpcMainInvokeEvent): Promise<AppResult<RendererImportState>> => {
      if (!deps.isTrustedFrame(event.senderFrame)) return refuse();
      return ok(await deps.store.state());
    },
  );

  deps.ipcMain.handle(
    PLATFORM_IPC.RENDERER_IMPORT_COMPLETE,
    async (event: IpcMainInvokeEvent, payload: unknown): Promise<AppResult<void>> => {
      if (!deps.isTrustedFrame(event.senderFrame)) return refuse();
      const parsed = platformIpcRequestSchema.safeParse({
        channel: PLATFORM_IPC.RENDERER_IMPORT_COMPLETE,
        args: [payload],
      });
      if (!parsed.success) {
        return toIpcAppResult(err(platformInvalidUrl('Import report is invalid.')));
      }
      const [report] = parsed.data.args as unknown as [RendererImportReport];
      await deps.store.complete(report);
      return ok(undefined);
    },
  );
}
