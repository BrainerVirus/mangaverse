import { describe, expect, it } from 'vitest';

import { createRequestGate, parseRetryAfterMs } from './request-gate';

interface FakeClock {
  now: () => number;
  sleep: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  readonly delays: number[];
  set(value: number): void;
}

function fakeClock(start = 0): FakeClock {
  let t = start;
  const delays: number[] = [];
  return {
    now: () => t,
    sleep: async (delayMs) => {
      delays.push(delayMs);
      t += delayMs;
    },
    delays,
    set: (value) => {
      t = value;
    },
  };
}

describe('createRequestGate', () => {
  it('Given three requests at a 3-per-minute pace, When a fourth starts, Then it waits for the window', async () => {
    const clock = fakeClock(1_000);
    const gate = createRequestGate({
      defaultRequestsPerMinute: 40,
      now: clock.now,
      sleep: clock.sleep,
    });

    await gate.acquire({ requestsPerMinute: 3 });
    await gate.acquire({ requestsPerMinute: 3 });
    await gate.acquire({ requestsPerMinute: 3 });
    expect(clock.delays).toEqual([]);

    await gate.acquire({ requestsPerMinute: 3 });
    expect(clock.delays).toHaveLength(1);
    expect(clock.delays[0]).toBeGreaterThan(0);
    expect(clock.delays[0]).toBeLessThanOrEqual(60_000);
  });

  it("Given the manifest's 40 rpm default, When the 41st request starts, Then it waits", async () => {
    const clock = fakeClock(0);
    const gate = createRequestGate({
      defaultRequestsPerMinute: 40,
      now: clock.now,
      sleep: clock.sleep,
    });

    for (let i = 0; i < 40; i += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      await gate.acquire();
    }
    expect(clock.delays).toEqual([]);
    // oxlint-disable-next-line eslint/no-await-in-loop
    await gate.acquire();
    expect(clock.delays).toHaveLength(1);
  });

  it('Given a 429 with Retry-After: 2, When a queued request runs, Then it waits at least two seconds', async () => {
    const clock = fakeClock(1_000);
    const gate = createRequestGate({
      defaultRequestsPerMinute: 40,
      now: clock.now,
      sleep: clock.sleep,
    });

    await gate.acquire();
    const retryAfterMs = gate.noteResponse(429, { 'retry-after': '2' });
    expect(retryAfterMs).toBe(2_000);
    expect(gate.blockedUntilMs()).toBe(3_000);

    await gate.acquire();
    expect(clock.delays[0]).toBeGreaterThanOrEqual(2_000);
    expect(gate.blockedUntilMs()).toBeUndefined();
  });

  it('Given a Retry-After beyond the auto-wait limit, Then the gate keeps the full horizon and refuses instead of sleeping', async () => {
    const gate = createRequestGate({ defaultRequestsPerMinute: 10, now: () => 0 });
    expect(gate.noteResponse(429, { 'retry-after': '3600' })).toBe(3_600_000);
    expect(gate.blockedUntilMs()).toBe(3_600_000);
    await expect(gate.acquire()).rejects.toMatchObject({
      code: 'extensions.sdk.ratelimit.blocked',
      details: { retryAfterMs: 3_600_000 },
    });
  });

  it('Given a numeric Retry-After that overflows, Then the horizon is kept and the failure is typed', async () => {
    expect(parseRetryAfterMs({ 'retry-after': '9'.repeat(400) }, 0)).toBe(Number.MAX_SAFE_INTEGER);
    const gate = createRequestGate({ defaultRequestsPerMinute: 10, now: () => 0 });
    gate.noteResponse(429, { 'retry-after': '9'.repeat(400) });
    await expect(gate.acquire()).rejects.toMatchObject({
      code: 'extensions.sdk.ratelimit.blocked',
    });
  });

  it('Given a 429 with an HTTP-date Retry-After, Then the gate blocks until that date', () => {
    const nowMs = Date.parse('2026-01-01T00:00:00Z');
    const gate = createRequestGate({ defaultRequestsPerMinute: 40, now: () => nowMs });
    const header = new Date(nowMs + 5_000).toUTCString();

    expect(gate.noteResponse(429, { 'Retry-After': header })).toBe(5_000);
    expect(gate.blockedUntilMs()).toBe(nowMs + 5_000);
  });

  it('Given a 429 without Retry-After, Then the gate falls back to a minute', () => {
    const nowMs = 0;
    expect(parseRetryAfterMs({}, nowMs)).toBe(60_000);
    expect(parseRetryAfterMs({ 'retry-after': 'garbage' }, nowMs)).toBe(60_000);
    const farFuture = new Date(nowMs + 60 * 60_000).toUTCString();
    // The source's full horizon is kept; a long wait is refused at acquire time instead.
    expect(parseRetryAfterMs({ 'retry-after': farFuture }, nowMs)).toBe(60 * 60_000);
  });

  it('Given a request aborted while waiting, Then acquire rejects with the typed blocked error', async () => {
    const gate = createRequestGate({ defaultRequestsPerMinute: 1, now: () => 0 });
    await gate.acquire();

    const controller = new AbortController();
    const pending = gate.acquire({ signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({
      code: 'extensions.sdk.ratelimit.blocked',
      details: { aborted: true },
    });
  });

  it('Given a zero rate limit, When acquire starts, Then it rejects with the typed blocked error', async () => {
    const gate = createRequestGate({ defaultRequestsPerMinute: 40 });
    await expect(gate.acquire({ requestsPerMinute: 0 })).rejects.toMatchObject({
      code: 'extensions.sdk.ratelimit.blocked',
    });
    await expect(
      createRequestGate({ defaultRequestsPerMinute: 0 }).acquire(),
    ).rejects.toMatchObject({ code: 'extensions.sdk.ratelimit.blocked' });
  });

  it('Given a successful response, Then noteResponse leaves the gate open', () => {
    const gate = createRequestGate({ defaultRequestsPerMinute: 40, now: () => 0 });
    expect(gate.noteResponse(200, {})).toBeUndefined();
    expect(gate.blockedUntilMs()).toBeUndefined();
  });

  it('Given a park, Then remainingWaitMs reports how long a caller still waits', () => {
    const clock = fakeClock(1_000);
    const gate = createRequestGate({
      defaultRequestsPerMinute: 40,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(gate.remainingWaitMs()).toBe(0);

    gate.noteResponse(429, { 'retry-after': '2' });
    expect(gate.remainingWaitMs()).toBe(2_000);

    clock.set(2_500);
    expect(gate.remainingWaitMs()).toBe(500);
    expect(gate.blockedUntilMs()).toBe(3_000);

    clock.set(3_000);
    expect(gate.remainingWaitMs()).toBe(0);
  });
});
