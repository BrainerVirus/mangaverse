import { describe, expect, it } from 'vitest';
import { parsePortInUseMessage, parseViteLocalUrl } from './vite-dev-url.mjs';

describe('parseViteLocalUrl', () => {
  it('parses the default Vite Local line', () => {
    expect(parseViteLocalUrl('  ➜  Local:   http://localhost:5173/\n')).toBe(
      'http://localhost:5173',
    );
  });

  it('parses an alternate port when the default is busy', () => {
    expect(parseViteLocalUrl('  ➜  Local:   http://localhost:5176/\n')).toBe(
      'http://localhost:5176',
    );
  });

  it('returns null when no Local URL is present', () => {
    expect(parseViteLocalUrl('ready in 120 ms\n')).toBeNull();
  });
});

describe('parsePortInUseMessage', () => {
  it('parses Vite port-in-use warnings', () => {
    expect(parsePortInUseMessage('Port 5173 is in use, trying another one...\n')).toBe(5173);
  });

  it('returns null for unrelated output', () => {
    expect(parsePortInUseMessage('ready in 120 ms\n')).toBeNull();
  });
});
