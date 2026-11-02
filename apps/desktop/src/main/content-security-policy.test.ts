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
  });

  it('names no provider origin in either policy', () => {
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';
    for (const csp of [buildContentSecurityPolicy(true), buildContentSecurityPolicy(false)]) {
      expect(csp).not.toContain('mangadex');
      expect(csp).not.toContain('uploads.');
    }
  });

  it('limits connect-src to the app and the dev server', () => {
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';
    const dev = buildContentSecurityPolicy(true).split('; ');
    expect(dev).toContain("connect-src 'self' http://localhost:5173 ws://localhost:5173");

    const production = buildContentSecurityPolicy(false).split('; ');
    expect(production).toContain("connect-src 'self'");
    expect(production.find((directive) => directive.startsWith('connect-src'))).toBe(
      "connect-src 'self'",
    );
  });

  it('uses a strict policy in production', () => {
    const csp = buildContentSecurityPolicy(false);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval';");
    expect(csp).not.toContain("'unsafe-inline' 'unsafe-eval'");
    expect(csp).not.toMatch(/127\.0\.0\.1|localhost/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('mangadex');
  });

  it('lets images, and only images, load from the page store', () => {
    const directives = buildContentSecurityPolicy(false).split('; ');
    expect(directives).toContain("img-src 'self' data: blob: page:");
    expect(directives.filter((directive) => directive.includes('page:'))).toHaveLength(1);
    // Every remote image byte is fetched by main and shown from blob: or page://.
    expect(directives).not.toContain("img-src 'self' data: blob: https: page:");
  });
});
