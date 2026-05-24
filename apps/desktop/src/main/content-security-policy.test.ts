import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from './content-security-policy.js';

describe('buildContentSecurityPolicy', () => {
  it('allows Vite HMR origins in dev', () => {
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';
    const csp = buildContentSecurityPolicy(true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).toContain('http://localhost:5173');
    expect(csp).toContain('ws://localhost:5173');
    expect(csp).toContain('https://api.mangadex.org');
  });

  it('uses a strict policy in production', () => {
    const csp = buildContentSecurityPolicy(false);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain('http://127.0.0.1:*');
    expect(csp).toContain('https://api.mangadex.org');
  });
});
