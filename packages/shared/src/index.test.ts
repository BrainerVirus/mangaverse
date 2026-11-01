import { describe, expect, it } from 'vitest';
import {
  createAppError,
  getDefaultReaderSettings,
  ok,
  validateProviderManifest,
} from './index';

describe('@app/shared public exports', () => {
  it('exports core domain helpers', () => {
    expect(typeof ok).toBe('function');
    expect(typeof createAppError).toBe('function');
    expect(typeof getDefaultReaderSettings).toBe('function');
    expect(typeof validateProviderManifest).toBe('function');
  });
});
