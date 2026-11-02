// The wire contract between a window and the data host (ADR 0001, decisions 4 and 5).
// Requests carry an `id`; every request gets exactly one reply with that `id` and an
// `AppResult`. Types only: the host validates with Zod, the client stays dependency-free.
import type { AppError, AppResult } from '@app/shared';

export type DataHostRequest =
  | {
      readonly kind: 'call';
      readonly id: number;
      readonly method: string;
      readonly args: unknown[];
    }
  /** Whether the native database is open, or exists on disk to be opened. */
  | { readonly kind: 'status'; readonly id: number }
  /** Opens the native database; a snapshot is imported only when no native file exists. */
  | { readonly kind: 'open'; readonly id: number; readonly snapshot: Uint8Array | null };

export interface DataHostReply {
  /** `null` only when a malformed request carried no usable id. */
  readonly id: number | null;
  readonly result: AppResult<unknown>;
}

/**
 * Tables whose committed row changes the host broadcasts, each with the column that keys a
 * change. A membership row is keyed by its entry: that is the row a window holds.
 */
export const SYNCED_TABLES = {
  library_entries: 'id',
  library_category_memberships: 'library_entry_id',
  categories: 'id',
  manga_identities: 'id',
  manga_provider_mappings: 'id',
  chapters: 'id',
  chapter_read_state: 'chapter_id',
} as const;

export type SyncedTable = keyof typeof SYNCED_TABLES;

export interface RowChange {
  readonly table: SyncedTable;
  readonly key: string;
  readonly op: 'insert' | 'update' | 'delete';
}

/**
 * Committed changes, sent to every attached window after the reply to the call that made
 * them. `seq` counts batches per host process; a restarted host starts again at 1.
 */
export interface DataHostChanges {
  readonly kind: 'changes';
  readonly seq: number;
  readonly changes: readonly RowChange[];
}

/** What a window hears about committed data: a batch, or "refetch everything" after a reconnect. */
export type DataHostChangeEvent =
  | { readonly kind: 'changes'; readonly changes: readonly RowChange[] }
  | { readonly kind: 'resync' };

/** Everything the host posts on a port. */
export type DataHostMessage = DataHostReply | DataHostChanges;

export interface DataHostStatus {
  readonly open: boolean;
  readonly nativeExists: boolean;
}

export interface DataHostOpenResult {
  /** Present when this open imported a sql.js snapshot. */
  readonly imported: SnapshotImportReport | null;
}

export interface SnapshotImportReport {
  readonly tables: Readonly<Record<string, number>>;
  readonly totalRows: number;
  readonly checksum: string;
}

export const DATA_HOST_ERROR = {
  malformedMessage: 'data-host.malformed_message',
  unknownProcedure: 'data-host.unknown_procedure',
  invalidInput: 'data-host.invalid_input',
  procedureFailed: 'data-host.procedure_failed',
  notOpen: 'data-host.not_open',
  importFailed: 'data-host.import_failed',
  unserializableReply: 'data-host.unserializable_reply',
  unauthorizedFrame: 'data-host.unauthorized_frame',
  unavailable: 'data-host.unavailable',
  timeout: 'data-host.timeout',
  unboundedLoad: 'data-host.unbounded_load',
} as const;

/** A host refusal or failure, thrown by the client so callers see an ordinary rejection. */
export class DataHostError extends Error {
  readonly code: string;
  readonly details: AppError['details'];

  constructor(error: AppError) {
    super(error.message);
    this.name = 'DataHostError';
    this.code = error.code;
    this.details = error.details;
  }
}
