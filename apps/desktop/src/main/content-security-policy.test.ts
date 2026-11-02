import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from './content-security-policy.js';

describe('buildContentSecurityPolicy', () => {
  it('allows Vite HMR origins in dev', () => {
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';
    const csp = buildContentSecurityPolicy(true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).toContain('http://localhost:5173');
    expect(csp).toContain("style-src 'self' 'unsafe-inline' http://localhost:5173");
    expect(csp).toContain('ws://localhost:5173');
    expect(csp).toContain('https://api.mangadex.org');
    expect(csp).toContain('https://uploads.mangadex.org');
  });

  it('uses a strict policy in production', () => {
    const csp = buildContentSecurityPolicy(false);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval';");
    expect(csp).not.toContain("'unsafe-inline' 'unsafe-eval'");
    expect(csp).not.toMatch(/127\.0\.0\.1|localhost/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('https://api.mangadex.org');
    expect(csp).toContain('https://uploads.mangadex.org');
  });
});
