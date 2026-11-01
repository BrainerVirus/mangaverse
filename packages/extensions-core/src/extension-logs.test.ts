import { beforeEach, describe, expect, it } from 'vitest';
import { createSqlJsHarness } from '@app/db/testing';

import {
  clearProviderActivity,
  getProviderActivitySummary,
  listProviderActivity,
  recordExtensionLog,
  recordProviderFailure,
  resetExtensionLogThrottle,
  sanitizeLogDetails,
  sanitizeLogMessage,
} from './extension-logs.js';

const failure = {
  code: 'extensions.sdk.request.timeout',
  message: 'Request timed out.',
};

describe('provider activity log', () => {
  beforeEach(() => {
    resetExtensionLogThrottle();
  });

  it('deduplicates repeated page failures inside the throttle window', async () => {
    const { db } = await createSqlJsHarness();
    await recordProviderFailure(db, {
      providerId: 'p',
      operation: 'pages',
      error: failure,
      now: 1_000,
    });
    await recordProviderFailure(db, {
      providerId: 'p',
      operation: 'pages',
      error: failure,
      now: 20_000,
    });
    expect(await listProviderActivity(db, 'p')).toHaveLength(1);

    await recordProviderFailure(db, {
      providerId: 'p',
      operation: 'pages',
      error: failure,
      now: 1_000 + 60_001,
    });
    expect(await listProviderActivity(db, 'p')).toHaveLength(2);
  });

  it('does not throttle search failures, and never logs cancellations', async () => {
    const { db } = await createSqlJsHarness();
    await recordProviderFailure(db, {
      providerId: 'p',
      operation: 'search',
      error: failure,
      now: 1_000,
    });
    await recordProviderFailure(db, {
      providerId: 'p',
      operation: 'search',
      error: failure,
      now: 1_001,
    });
    const controller = new AbortController();
    controller.abort();
    await recordProviderFailure(db, {
      providerId: 'p',
      operation: 'pages',
      error: failure,
      signal: controller.signal,
      now: 2_000,
    });

    expect(await listProviderActivity(db, 'p')).toHaveLength(2);
  });

  it('never persists URLs with tokens or sensitive detail keys', async () => {
    const { db } = await createSqlJsHarness();
    await recordExtensionLog(db, {
      providerId: 'p',
      level: 'error',
      code: 'extensions.test',
      message:
        'Fetch https://api.example.test/a?token=supersecret failed with Bearer abc.def and password=hunter2',
      details: {
        operation: 'pages',
        chapterId: 'chapter-1',
        token: 'supersecret',
        authHeader: 'Bearer abc',
        url: 'https://api.example.test/a?token=supersecret',
        endpoint: 'https://api.example.test/a?token=supersecret',
      },
    });

    const [entry] = await listProviderActivity(db, 'p');
    expect(entry?.message).not.toContain('supersecret');
    expect(entry?.message).not.toContain('hunter2');
    expect(entry?.message).not.toContain('abc.def');
    expect(entry?.message).toContain('https://api.example.test/a');
    expect(entry?.details).toEqual({
      operation: 'pages',
      chapterId: 'chapter-1',
      endpoint: 'https://api.example.test/a',
    });
  });

  it('sanitizes activity rows written before the shared redactor', async () => {
    const { raw, db } = await createSqlJsHarness();
    raw.run(
      `INSERT INTO extension_logs (id, provider_id, level, code, message, details_json, created_at)
       VALUES ('raw', 'p', 'error', 'extensions.ops.tick', 'login password=SECRET FIRST', '{"token":"SECRET"}', '2020-01-01T00:00:00.000Z')`,
    );

    const [entry] = await listProviderActivity(db, 'p');
    expect(entry?.message).toBe('login password=[redacted]');
    expect(entry?.details).toBeNull();
  });

  it('filters activity by level and clears one provider', async () => {
    const { db } = await createSqlJsHarness();
    await recordExtensionLog(db, {
      providerId: 'p',
      level: 'info',
      code: 'extensions.ops.installed',
      message: 'Installed.',
    });
    await recordProviderFailure(db, { providerId: 'p', operation: 'search', error: failure });
    await recordExtensionLog(db, {
      providerId: 'other',
      level: 'warn',
      code: 'extensions.other',
      message: 'Other.',
    });

    expect(await listProviderActivity(db, 'p', 'error')).toHaveLength(1);
    await clearProviderActivity(db, 'p');
    expect(await listProviderActivity(db, 'p')).toHaveLength(0);
    expect(await listProviderActivity(db, 'other')).toHaveLength(1);
  });

  it('sanitizers keep only allowlisted, primitive details', () => {
    expect(sanitizeLogDetails({ operation: 'search', count: 2, nested: { a: 1 } })).toEqual({
      operation: 'search',
      count: 2,
    });
    expect(sanitizeLogMessage('https://x.test/a?key=abc')).toBe('https://x.test/a');
  });

  it('redacts JSON token fields and auth header values', () => {
    expect(sanitizeLogMessage('{"token":"s3cr3t","page":2}')).not.toContain('s3cr3t');
    expect(sanitizeLogMessage('{"api_key":"s3cr3t"}')).not.toContain('s3cr3t');
    expect(sanitizeLogMessage('X-Api-Key: s3cr3t')).toBe('X-Api-Key: [redacted]');
    expect(sanitizeLogMessage('authorization: Basic s3cr3t')).toBe('authorization: [redacted]');
    expect(sanitizeLogMessage('GET https://x.test/a?api_key=s3cr3t&page=2')).toBe(
      'GET https://x.test/a',
    );
    expect(sanitizeLogMessage('password=SECRET FIRST')).toBe('password=[redacted]');
    expect(sanitizeLogMessage('token=[redacted] extra')).toBe('token=[redacted]');
  });

  it('redacts cookie headers, quoted JSON credential fields and non-Bearer schemes', () => {
    expect(sanitizeLogMessage('Cookie: session=s3cr3t; theme=dark')).toBe('Cookie: [redacted]');
    expect(sanitizeLogMessage('Set-Cookie: session=s3cr3t; HttpOnly; Path=/')).toBe(
      'Set-Cookie: [redacted]',
    );
    expect(sanitizeLogMessage('{"cookie":"session=s3cr3t","page":2}')).toBe(
      '{"cookie":"[redacted]","page":2}',
    );
    expect(sanitizeLogMessage('{"authorization":"Basic dXNlcjpwYXNz"}')).toBe(
      '{"authorization":"[redacted]"}',
    );
    expect(sanitizeLogMessage('"Set-Cookie": "session=s3cr3t"')).toBe('"Set-Cookie":"[redacted]"');
    expect(sanitizeLogMessage('{"set-cookie":["a=s3cr3t","b=s3cr3t2"]}')).not.toContain('s3cr3t');
    expect(sanitizeLogMessage('{"cookie":{"session":"s3cr3t"}}')).not.toContain('s3cr3t');
    expect(sanitizeLogMessage('cookie=s3cr3t; theme=dark')).not.toContain('s3cr3t');
    expect(sanitizeLogMessage('authorization: Digest username="u", realm="r"')).toBe(
      'authorization: [redacted]',
    );
    expect(sanitizeLogMessage('authorization: Token s3cr3t')).toBe('authorization: [redacted]');
    expect(sanitizeLogMessage('Proxy-Authorization: Bearer abc.def')).toBe(
      'Proxy-Authorization: [redacted]',
    );
  });

  it('leaves normal prose alone', () => {
    expect(sanitizeLogMessage('The cookie crumbled while the page loaded.')).toBe(
      'The cookie crumbled while the page loaded.',
    );
    expect(sanitizeLogMessage('Set-Cookie is a header name.')).toBe('Set-Cookie is a header name.');
    expect(sanitizeLogMessage('The key to success is patience.')).toBe(
      'The key to success is patience.',
    );
    expect(sanitizeLogMessage('monkey=banana is not a credential')).toBe(
      'monkey=banana is not a credential',
    );
  });

  it('filters older errors server-side beyond the latest page', async () => {
    const { raw, db } = await createSqlJsHarness();
    for (let index = 0; index < 120; index += 1) {
      raw.run(
        `INSERT INTO extension_logs (id, provider_id, level, code, message, created_at)
         VALUES (?, 'p', 'info', 'extensions.ops.tick', ?, ?)`,
        [
          `tick-${index}`,
          `tick ${index}`,
          new Date(1_700_000_000_000 + index * 1000).toISOString(),
        ],
      );
    }
    raw.run(
      `INSERT INTO extension_logs (id, provider_id, level, code, message, created_at)
       VALUES ('older-error', 'p', 'error', 'extensions.sdk.request.timeout', 'Older failure.', '2020-01-01T00:00:00.000Z')`,
    );

    expect(await listProviderActivity(db, 'p')).toHaveLength(100);
    expect(await listProviderActivity(db, 'p')).not.toContainEqual(
      expect.objectContaining({ level: 'error' }),
    );
    const errors = await listProviderActivity(db, 'p', 'error');
    expect(errors.map((entry) => entry.message)).toEqual(['Older failure.']);
    const summary = await getProviderActivitySummary(db, 'p');
    expect(summary.counts.errors).toBe(1);
    expect(summary.counts.total).toBe(121);
  });

  it('reports the latest health check time from the full retained set', async () => {
    const { db } = await createSqlJsHarness();
    await recordExtensionLog(db, {
      providerId: 'p',
      level: 'info',
      code: 'extensions.health.ok',
      message: 'Health check: 1 passed.',
    });
    await recordExtensionLog(db, {
      providerId: 'p',
      level: 'info',
      code: 'extensions.ops.installed',
      message: 'Installed.',
    });

    const summary = await getProviderActivitySummary(db, 'p');
    expect(summary.lastHealthCheckAt).not.toBeNull();
  });
});
