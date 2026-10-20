import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDERER_PORT, resolveRendererPort } from './renderer-port.js';

describe('resolveRendererPort', () => {
  it('uses the default when the variable is unset', () => {
    expect(resolveRendererPort(undefined)).toBe(DEFAULT_RENDERER_PORT);
  });

  it('accepts a valid port', () => {
    expect(resolveRendererPort('8080')).toBe(8080);
  });

  it.each(['', 'abc', '0', '65536', '80.5'])('falls back for invalid value %j', (value) => {
    expect(resolveRendererPort(value)).toBe(DEFAULT_RENDERER_PORT);
  });
});
