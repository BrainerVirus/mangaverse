import type { AppError } from '@app/shared';
import { createAppError } from '@app/shared';

const DEFAULT_WINDOW_MS = 60_000;
/** A 429 without a usable `Retry-After` means the source is unhappy for a while. */
const DEFAULT_RETRY_AFTER_MS = 60_000;
/** A misbehaving or hostile source cannot park a provider for longer than this. */
const MAX_RETRY_AFTER_MS = 15 * 60_000;

export interface RequestGateOptions {
  /** The manifest's declared pace, used when a request carries no override. */
  readonly defaultRequestsPerMinute: number;
  readonly now?: () => number;
  readonly sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  readonly windowMs?: number;
}

export interface RequestGateAcquireOptions {
  /** Per-request override, e.g. the user's `rateLimitOverrideRpm` setting. */
  readonly requestsPerMinute?: number;
  readonly signal?: AbortSignal;
}

export interface RequestGate {
  /**
   * Waits for a slot in the provider's window and resolves when the caller may send
   * its request. A normal over-limit caller waits; `rpm <= 0` or an abort while
   * waiting rejects with `extensions.sdk.ratelimit.blocked`.
   */
  acquire(input?: RequestGateAcquireOptions): Promise<void>;
  /**
   * Records a response so a 429 parks every later `acquire` until `Retry-After`
   * elapses. Returns the applied `retryAfterMs` on a 429, otherwise `undefined`.
   */
  noteResponse(status: number, headers?: Readonly<Record<string, string>>): number | undefined;
  /** The pending block horizon in epoch milliseconds, or `undefined` when open. */
  blockedUntilMs(): number | undefined;
  /**
   * How long a caller would still wait before a parked gate opens, in milliseconds.
   * `0` when the gate is open. A request client reports this in an aborted or
   * blocked error so the user sees the real wait instead of a bare zero.
   */
  remainingWaitMs(): number;
}

function blockedError(message: string, retryAfterMs: number, aborted = false): AppError {
  return createAppError({
    code: 'extensions.sdk.ratelimit.blocked',
    message,
    details: { retryAfterMs, ...(aborted ? { aborted } : {}) },
  });
}

function headerValue(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

/**
 * `Retry-After` is either delta-seconds or an HTTP-date (RFC 9110). Anything else
 * falls back to a full window, and the result is capped so a bogus far-future date
 * cannot park a provider indefinitely.
 */
export function parseRetryAfterMs(
  headers: Readonly<Record<string, string>> | undefined,
  nowMs: number,
): number {
  const raw = headers === undefined ? undefined : headerValue(headers, 'retry-after')?.trim();
  let valueMs = DEFAULT_RETRY_AFTER_MS;
  if (raw !== undefined && raw.length > 0) {
    if (/^\d+$/.test(raw)) {
      valueMs = Number(raw) * 1000;
    } else {
      const dateMs = Date.parse(raw);
      if (!Number.isNaN(dateMs)) valueMs = dateMs - nowMs;
    }
  }
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, Math.round(valueMs)));
}

function defaultSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (delayMs <= 0) {
      resolve();
      return;
    }
    if (signal?.aborted === true) {
      reject(new Error('aborted'));
      return;
    }
    let settled = false;
    const finish = (): void => {
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = (): void => {
      if (settled) return;
      finish();
      reject(new Error('aborted'));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      finish();
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

interface GateState {
  readonly timestamps: number[];
  blockedUntil: number | undefined;
}

/**
 * One gate per provider per device: a sliding window over the last `windowMs`, plus
 * a 429 horizon sourced from the source's own `Retry-After`. Callers queue rather
 * than fail, so a burst of searches stays usable while respecting the declared pace.
 */
export function createRequestGate(options: RequestGateOptions): RequestGate {
  const defaultRpm = options.defaultRequestsPerMinute;
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? defaultSleep;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const state: GateState = { timestamps: [], blockedUntil: undefined };

  function prune(t: number): void {
    while (state.timestamps.length > 0 && t - state.timestamps[0]! >= windowMs) {
      state.timestamps.shift();
    }
  }

  function assertNotAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted === true) {
      throw blockedError('Request was aborted while waiting for a rate-limit slot.', 0, true);
    }
  }

  async function wait(delayMs: number, signal: AbortSignal | undefined): Promise<void> {
    if (delayMs <= 0) return;
    await sleep(delayMs, signal).catch((error: unknown) => {
      if (signal?.aborted === true) {
        throw blockedError('Request was aborted while waiting for a rate-limit slot.', 0, true);
      }
      throw error;
    });
    assertNotAborted(signal);
  }

  return {
    async acquire(input = {}) {
      const rpm = input.requestsPerMinute ?? defaultRpm;
      if (!Number.isFinite(rpm) || rpm <= 0) {
        throw blockedError('Rate limit is zero; request rejected.', 0);
      }

      for (;;) {
        assertNotAborted(input.signal);
        const t = now();
        const blockedUntil = state.blockedUntil;
        if (blockedUntil !== undefined) {
          if (blockedUntil > t) {
            await wait(blockedUntil - t, input.signal);
            continue;
          }
          state.blockedUntil = undefined;
        }

        prune(t);
        if (state.timestamps.length < rpm) {
          state.timestamps.push(t);
          return;
        }
        const waitMs = Math.max(1, windowMs - (t - state.timestamps[0]!));
        await wait(waitMs, input.signal);
      }
    },
    noteResponse(status, headers) {
      if (status !== 429) return undefined;
      const t = now();
      const retryAfterMs = parseRetryAfterMs(headers, t);
      const until = t + retryAfterMs;
      state.blockedUntil =
        state.blockedUntil === undefined ? until : Math.max(state.blockedUntil, until);
      return retryAfterMs;
    },
    blockedUntilMs() {
      const t = now();
      const blockedUntil = state.blockedUntil;
      if (blockedUntil === undefined || blockedUntil <= t) {
        state.blockedUntil = undefined;
        return undefined;
      }
      return blockedUntil;
    },
    remainingWaitMs() {
      const blockedUntil = state.blockedUntil;
      if (blockedUntil === undefined) return 0;
      return Math.max(0, blockedUntil - now());
    },
  };
}
