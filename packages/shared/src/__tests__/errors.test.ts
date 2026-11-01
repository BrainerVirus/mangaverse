import { describe, expect, it } from 'vitest';
import { errorMessage } from '../errors.js';

describe('errorMessage', () => {
  it('uses an Error message', () => {
    expect(errorMessage(new Error('Provider timed out.'), 'Fallback copy.')).toBe(
      'Provider timed out.',
    );
  });

  it('prefers a serialized object message only when the caller opts in', () => {
    // IPC and provider adapters rethrow plain objects; the provider log trusts
    // them, the queue and UI sites keep their own copy.
    const serialized = { message: 'from the provider' };
    expect(errorMessage(serialized, 'Fallback copy.')).toBe('Fallback copy.');
    expect(errorMessage(serialized, 'Fallback copy.', { acceptSerializedMessage: true })).toBe(
      'from the provider',
    );
  });

  it('falls back for a missing, empty or whitespace-only message', () => {
    expect(errorMessage(undefined, 'Fallback copy.')).toBe('Fallback copy.');
    expect(errorMessage('boom', 'Fallback copy.')).toBe('Fallback copy.');
    expect(errorMessage({}, 'Fallback copy.')).toBe('Fallback copy.');
    expect(errorMessage(new Error(''), 'Fallback copy.')).toBe('Fallback copy.');
    expect(errorMessage(new Error('   '), 'Fallback copy.')).toBe('Fallback copy.');
  });
});
