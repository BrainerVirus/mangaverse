import { existsSync } from 'node:fs';
import { createAppError, err, ok, type AppError, type AppResult } from '@app/shared';
import { z } from 'zod';
import {
  DATA_HOST_ERROR,
  type DataHostOpenResult,
  type DataHostReply,
  type DataHostRequest,
  type DataHostStatus,
} from '../data-host-protocol.js';
import { importSnapshot } from './import-snapshot.js';
import { openNativeDatabase, type NativeDatabase } from './open-native.js';
import { PROCEDURES } from './procedures.js';

/** One window's end of its MessagePort, whatever the runtime calls it. */
export interface DataHostPort {
  postMessage(reply: DataHostReply): void;
  onMessage(listener: (data: unknown) => void): void;
}

export interface DataHost {
  /** Serves a port main handed over. Main gives one only to a frame it created (X6). */
  attach(port: DataHostPort): void;
  /** Resolves once every request received so far has been answered. */
  idle(): Promise<void>;
  close(): void;
}

const requestId = z.number().int().nonnegative();
const requestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('call'),
    id: requestId,
    method: z.string().min(1),
    args: z.array(z.unknown()),
  }),
  z.object({ kind: z.literal('status'), id: requestId }),
  z.object({
    kind: z.literal('open'),
    id: requestId,
    snapshot: z.instanceof(Uint8Array).nullable(),
  }),
]) satisfies z.ZodType<DataHostRequest>;

function idOf(data: unknown): number | null {
  const parsed = requestId.safeParse((data as { id?: unknown } | null)?.id);
  return parsed.success ? parsed.data : null;
}

function failure(code: string, error: unknown, fallback: string): AppError {
  const cause = error as { message?: unknown; code?: unknown } | null;
  return createAppError({
    code,
    message: typeof cause?.message === 'string' ? cause.message : fallback,
    ...(typeof cause?.code === 'string' ? { details: { cause: cause.code } } : {}),
  });
}

/**
 * The data host: owns the native database and answers requests from every attached port,
 * strictly one at a time in arrival order, so an async repository never interleaves with
 * another call at its `await` points (ADR 0001, decision 5).
 */
export function createDataHost(options: { readonly databasePath: string }): DataHost {
  const { databasePath } = options;
  let database: NativeDatabase | null = null;
  let tail: Promise<void> = Promise.resolve();

  const open = (snapshot: Uint8Array | null): AppResult<DataHostOpenResult> => {
    if (database !== null) return ok({ imported: null });
    const imported =
      snapshot !== null && !existsSync(databasePath)
        ? importSnapshot(snapshot, databasePath)
        : null;
    database = openNativeDatabase(databasePath);
    return ok({ imported });
  };

  const run = (request: DataHostRequest): Promise<AppResult<unknown>> | AppResult<unknown> => {
    switch (request.kind) {
      case 'status':
        return ok<DataHostStatus>({
          open: database !== null,
          nativeExists: existsSync(databasePath),
        });
      case 'open':
        return Promise.resolve()
          .then(() => open(request.snapshot))
          .then(undefined, (error: unknown) =>
            err(
              failure(
                request.snapshot === null
                  ? DATA_HOST_ERROR.procedureFailed
                  : DATA_HOST_ERROR.importFailed,
                error,
                'The local database could not be opened.',
              ),
            ),
          );
      case 'call': {
        const procedure = PROCEDURES.get(request.method);
        if (procedure === undefined) {
          return err(
            createAppError({
              code: DATA_HOST_ERROR.unknownProcedure,
              message: `No procedure named ${request.method}.`,
            }),
          );
        }
        const input = procedure.input.safeParse(request.args);
        if (!input.success) {
          return err(
            createAppError({
              code: DATA_HOST_ERROR.invalidInput,
              message: `Rejected arguments for ${request.method}: ${z.prettifyError(input.error)}`,
            }),
          );
        }
        const db = database?.db;
        if (db === undefined) {
          return err(
            createAppError({ code: DATA_HOST_ERROR.notOpen, message: 'The database is not open.' }),
          );
        }
        // The validated original arguments run, so a schema never silently drops a field.
        return Promise.resolve()
          .then(() => procedure.run(db, ...request.args))
          .then(
            (value) => ok(value),
            (error: unknown) =>
              err(failure(DATA_HOST_ERROR.procedureFailed, error, `${request.method} failed.`)),
          );
      }
    }
  };

  const handle = (port: DataHostPort, data: unknown): Promise<void> => {
    const parsed = requestSchema.safeParse(data);
    const id = parsed.success ? parsed.data.id : idOf(data);
    const result = parsed.success
      ? Promise.resolve(run(parsed.data))
      : Promise.resolve(
          err(
            createAppError({
              code: DATA_HOST_ERROR.malformedMessage,
              message: 'The data host refused a malformed message.',
            }),
          ),
        );
    return result
      .then((answer) => port.postMessage({ id, result: answer }))
      .then(undefined, (error: unknown) =>
        port.postMessage({
          id,
          result: err(
            failure(DATA_HOST_ERROR.unserializableReply, error, 'The reply could not be sent.'),
          ),
        }),
      )
      .then(undefined, () => undefined);
  };

  return {
    attach(port) {
      port.onMessage((data) => {
        tail = tail.then(() => handle(port, data));
      });
    },
    idle: () => tail,
    close() {
      database?.close();
      database = null;
    },
  };
}
