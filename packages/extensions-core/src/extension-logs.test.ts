import { beforeEach, describe, expect, it } from 'vitest';
import { createSqlJsHarness } from '@app/db/testing';

import {
  clearProviderActivity,
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
});
