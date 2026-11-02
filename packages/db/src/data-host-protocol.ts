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
