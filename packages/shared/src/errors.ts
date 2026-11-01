/**
 * The one place a failure becomes something the UI may show (spec F1). The raw
 * error stays on `cause` for the redacted log; `message` is always our own copy.
 */
import type { AppError } from './result.js';

export const APP_ERROR_KINDS = [
  'offline',
  'provider-unavailable',
  'rate-limited',
  'not-found',
  'storage-full',
  'database',
  'unexpected',
] as const;

export type AppErrorKind = (typeof APP_ERROR_KINDS)[number];

export interface ClassifiedAppError extends AppError {
  readonly code: AppErrorKind;
  readonly retryable: boolean;
}

export interface ClassifyAppErrorContext {
  /** `navigator.onLine` at the failure; `false` makes a network failure `offline`. */
  readonly online?: boolean;
  /** Replaces the generic copy for an `unexpected` failure, e.g. "Could not save." */
  readonly fallbackMessage?: string;
}

/** A failure whose message we wrote for users, so it survives classification. */
export class UserFacingError extends Error {
  override readonly name = 'UserFacingError';
  readonly kind: AppErrorKind;

  constructor(message: string, options: { readonly kind?: AppErrorKind; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.kind = options.kind ?? 'unexpected';
  }
}

const MESSAGES: Readonly<Record<AppErrorKind, string>> = {
  offline: "You're offline. Reconnect and try again.",
  'provider-unavailable': "The source isn't responding. Try again in a moment.",
  'rate-limited': 'The source is limiting requests. Wait a moment and try again.',
  'not-found': "We couldn't find that.",
  'storage-full': 'This device is out of storage. Free some space and try again.',
  database: "The local library couldn't be read or saved. Try again.",
  unexpected: 'Something went wrong. Try again.',
};

const MAX_CAUSE_DEPTH = 5;
const NETWORK_FAILURE = /failed to fetch|networkerror|network request failed|load failed/;
const QUOTA_FAILURE = /quota|sqlite_full|disk is full|disk full/;
const RATE_LIMIT_FAILURE = /rate.?limit|too many requests/;
const PROVIDER_FAILURE = /provider|timed out|timeout|\bhttp \d{3}\b/;
const DATABASE_FAILURE = /sqlite|sql\.js|database|no such table|no such column|constraint failed/;

const classified = new WeakSet<object>();

interface FailureSignals {
  readonly names: readonly string[];
  readonly codes: readonly string[];
  readonly text: string;
  readonly status: number | undefined;
  readonly providerId: string | undefined;
}

function field(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key];
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Walks the cause chain, because callers rewrap provider failures in plain Errors. */
function readSignals(error: unknown): FailureSignals {
  const names: string[] = [];
  const codes: string[] = [];
  const text: string[] = [];
  let status: number | undefined;
  let providerId: string | undefined;

  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== undefined; depth += 1) {
    if (typeof current === 'string') {
      text.push(current);
      break;
    }
    if (typeof current !== 'object' || current === null) break;

    const name = stringField(field(current, 'name'));
    if (name !== undefined) names.push(name);
    const code = stringField(field(current, 'code'));
    if (code !== undefined) codes.push(code.toLowerCase());
    const message = stringField(field(current, 'message'));
    if (message !== undefined) text.push(message);
    const details = field(current, 'details');
    status ??=
      numberField(field(current, 'status')) ??
      (typeof details === 'object' && details !== null
        ? numberField(field(details, 'status'))
        : undefined);
    providerId ??= stringField(field(current, 'providerId'));
    current = field(current, 'cause');
  }

  return { names, codes, text: text.join(' ').toLowerCase(), status, providerId };
}

function kindOf(signals: FailureSignals, online: boolean | undefined): AppErrorKind {
  const { names, codes, text, status } = signals;
  if (names.includes('QuotaExceededError') || QUOTA_FAILURE.test(text)) return 'storage-full';
  if (status === 429 || RATE_LIMIT_FAILURE.test(text)) return 'rate-limited';
  if (status === 404 || codes.some((code) => code.endsWith('not_found'))) return 'not-found';
  if (NETWORK_FAILURE.test(text)) return online === false ? 'offline' : 'provider-unavailable';
  if (
    (status !== undefined && status >= 400) ||
    names.includes('TimeoutError') ||
    codes.some((code) => code.startsWith('extensions.')) ||
    PROVIDER_FAILURE.test(text)
  ) {
    return 'provider-unavailable';
  }
  if (codes.some((code) => code.startsWith('db.')) || DATABASE_FAILURE.test(text)) {
    return 'database';
  }
  return 'unexpected';
}

/** Classifies once: an already classified failure comes back untouched. */
export function classifyAppError(
  error: unknown,
  context: ClassifyAppErrorContext = {},
): ClassifiedAppError {
  if (typeof error === 'object' && error !== null && classified.has(error)) {
    return error as ClassifiedAppError;
  }

  const signals = readSignals(error);
  const isUserFacing = error instanceof UserFacingError;
  const kind = isUserFacing ? error.kind : kindOf(signals, context.online);
  const fallback = kind === 'unexpected' ? context.fallbackMessage : undefined;
  const result: ClassifiedAppError = {
    code: kind,
    message: isUserFacing ? error.message : (fallback ?? MESSAGES[kind]),
    cause: error,
    retryable: kind !== 'not-found',
    ...(signals.providerId !== undefined ? { providerId: signals.providerId } : {}),
  };
  classified.add(result);
  return result;
}

/** A cancelled request is not a failure: nobody should be told about it. */
export function isCancellationError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = field(error, 'name');
  return name === 'AbortError' || name === 'CancelledError';
}

/** The internal text for the local log, which redacts it before keeping it. */
export function failureLogText(error: ClassifiedAppError): string {
  const { text } = readSignals(error.cause);
  return text.length > 0 ? text : error.message;
}
