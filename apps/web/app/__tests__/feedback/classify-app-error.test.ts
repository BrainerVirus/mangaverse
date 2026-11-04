import { describe, expect, it } from 'vitest';
import { DATA_HOST_ERROR, DataHostError } from '@app/db';
import { classifyAppError, UserFacingError, createAppError } from '@app/shared';

describe('classifyAppError', () => {
  it.each([
    ['offline', new TypeError('Failed to fetch'), { online: false }],
    ['provider-unavailable', new TypeError('Failed to fetch'), { online: true }],
    [
      'provider-unavailable',
      createAppError({ code: 'extensions.mangadex.payload_invalid', message: 'x' }),
      {},
    ],
    ['rate-limited', createAppError({ code: 'http', message: 'x', details: { status: 429 } }), {}],
    ['not-found', Object.assign(new Error('gone'), { status: 404 }), {}],
    ['storage-full', new DOMException('over', 'QuotaExceededError'), {}],
    ['database', new Error('SQLITE_ERROR: no such table: manga'), {}],
    ['unexpected', new Error('x is not a function'), {}],
  ] as const)('Given a failure, When classified, Then it is %s', (kind, error, context) => {
    expect(classifyAppError(error, context).code).toBe(kind);
  });

  it('Given a provider failure rewrapped in a plain Error, When classified, Then the cause decides', () => {
    const wrapped = new Error('Request failed', {
      cause: createAppError({ code: 'http', message: 'HTTP 429.', details: { status: 429 } }),
    });
    expect(classifyAppError(wrapped).code).toBe('rate-limited');
  });

  it('Given internal text, When classified, Then the message hides it and the cause keeps it', () => {
    const raw = new Error('["manga-detail-chapters","x"] data is undefined');
    const result = classifyAppError(raw);
    expect(result.message).not.toContain('manga-detail-chapters');
    expect(result.cause).toBe(raw);
  });

  it('Given a provider-shaped object claiming a kind, When classified, Then its raw message is not trusted', () => {
    const result = classifyAppError({ code: 'not-found', message: 'SECRET internal' });
    expect(result.message).not.toContain('SECRET');
  });

  it('Given a classified failure, When classified again, Then the same value returns', () => {
    const first = classifyAppError(new Error('boom'));
    expect(classifyAppError(first, { fallbackMessage: 'other' })).toBe(first);
  });

  it('Given an unexpected failure and a fallback, When classified, Then the fallback is shown', () => {
    expect(
      classifyAppError(new Error('boom'), { fallbackMessage: 'Could not save.' }).message,
    ).toBe('Could not save.');
  });

  it('Given a user-facing error, When classified, Then its own words survive', () => {
    expect(classifyAppError(new UserFacingError('This backup is damaged.')).message).toBe(
      'This backup is damaged.',
    );
  });

  describe('a data host restart', () => {
    const crashed = () =>
      new DataHostError(
        createAppError({
          code: DATA_HOST_ERROR.crashed,
          message:
            'The local database restarted while this was in progress. It may or may not have been saved.',
        }),
      );

    it('Given a call lost to a crash, When classified, Then the outcome is unknown and not retryable', () => {
      const result = classifyAppError(crashed());
      expect(result.code).toBe('outcome-unknown');
      expect(result.retryable).toBe(false);
      expect(result.message).toMatch(/may or may not have been saved/);
      expect(result.message).toMatch(/check/i);
      expect(result.message).not.toMatch(/try again|retry|redo/i);
    });

    it('Given the crash rewrapped in a plain Error, When classified, Then the cause still decides', () => {
      const result = classifyAppError(new Error('Could not add', { cause: crashed() }));
      expect(result.code).toBe('outcome-unknown');
      expect(result.retryable).toBe(false);
    });

    it('Given a host that merely timed out, When classified, Then it is classified and retried as before', () => {
      const result = classifyAppError(
        new DataHostError(
          createAppError({
            code: DATA_HOST_ERROR.timeout,
            message: 'The local database did not answer in time.',
          }),
        ),
      );
      expect(result.code).toBe('database');
      expect(result.retryable).toBe(true);
    });
  });

  it('Given not-found, When classified, Then it is not retryable', () => {
    expect(classifyAppError(Object.assign(new Error('x'), { status: 404 })).retryable).toBe(false);
    expect(classifyAppError(new Error('x')).retryable).toBe(true);
  });
});
