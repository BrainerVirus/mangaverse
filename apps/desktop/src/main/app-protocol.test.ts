import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAppProtocolHandler, resolveAppRequest } from './app-protocol.js';

let base: string;
let root: string;

beforeAll(async () => {
  base = realpathSync(await mkdtemp(join(tmpdir(), 'app-protocol-')));
  root = join(base, 'renderer');
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><title>shell</title>');
  await writeFile(join(root, 'assets', 'index-abc.js'), 'export {};');
  await writeFile(join(root, 'assets', 'index-abc.css'), 'body{}');
  await writeFile(join(root, 'assets', 'sql-wasm.wasm'), new Uint8Array([0, 97, 115, 109]));
  await writeFile(join(root, 'assets', 'inter.woff2'), 'font');
  await writeFile(join(base, 'secret.txt'), 'outside the root');
  await symlink(join(base, 'secret.txt'), join(root, 'assets', 'linked.txt'));
  await symlink(base, join(root, 'escape'));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('resolveAppRequest', () => {
  it('serves the shell for the root, deep routes and dotted route segments', async () => {
    for (const url of [
      'app://app/',
      'app://app/library',
      'app://app/manga/abc/chapter/1?x=1#y',
      'app://app/manga/one.piece',
    ]) {
      expect(await resolveAppRequest(root, url)).toEqual({
        kind: 'file',
        path: join(root, 'index.html'),
        mimeType: 'text/html; charset=utf-8',
      });
    }
  });

  it('serves assets with their MIME types', async () => {
    const cases = [
      ['assets/index-abc.js', 'text/javascript; charset=utf-8'],
      ['assets/index-abc.css', 'text/css; charset=utf-8'],
      ['assets/sql-wasm.wasm', 'application/wasm'],
      ['assets/inter.woff2', 'font/woff2'],
    ] as const;
    for (const [file, mimeType] of cases) {
      expect(await resolveAppRequest(root, `app://app/${file}`)).toEqual({
        kind: 'file',
        path: join(root, file),
        mimeType,
      });
    }
  });

  it('answers 404 for missing assets instead of the shell', async () => {
    for (const url of [
      'app://app/assets/missing.js',
      'app://app/assets/missing',
      'app://app/missing.js',
    ]) {
      expect(await resolveAppRequest(root, url)).toEqual({
        kind: 'refused',
        status: 404,
      });
    }
  });

  it('refuses traversal, encoded separators and other hosts', async () => {
    const refused = [
      'app://app/%2e%2e/secret.txt',
      'app://app/assets/%2E%2E%2F%2E%2E%2Fsecret.txt',
      'app://app/assets%2f..%2f..%2fsecret.txt',
      'app://app/..%5csecret.txt',
      'app://app/%00index.html',
      'app://other/index.html',
      'file:///etc/passwd',
    ];
    const results = await Promise.all(
      refused.map(async (url) => ({ url, kind: (await resolveAppRequest(root, url)).kind })),
    );
    expect(results).toEqual(refused.map((url) => ({ url, kind: 'refused' })));
    // The URL parser folds a raw `..` to `/secret.txt` inside the root, which does not exist.
    expect(await resolveAppRequest(root, 'app://app/../../secret.txt')).toEqual({
      kind: 'refused',
      status: 404,
    });
  });

  it('refuses an absolute path outside the root', async () => {
    const result = await resolveAppRequest(
      root,
      `app://app/${encodeURIComponent(base)}/secret.txt`,
    );
    expect(result).toEqual({ kind: 'refused', status: 403 });
  });

  it('refuses symlinks and paths through a symlinked directory', async () => {
    expect(await resolveAppRequest(root, 'app://app/assets/linked.txt')).toEqual({
      kind: 'refused',
      status: 403,
    });
    expect(await resolveAppRequest(root, 'app://app/escape/secret.txt')).toEqual({
      kind: 'refused',
      status: 403,
    });
  });

  it('refuses methods other than GET and HEAD', async () => {
    expect(await resolveAppRequest(root, 'app://app/', 'POST')).toEqual({
      kind: 'refused',
      status: 405,
    });
  });
});

describe('createAppProtocolHandler', () => {
  // The real policy comes from content-security-policy.ts (its own test); importing it here would
  // load the electron module.
  const csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'";
  const handler = () => createAppProtocolHandler({ root, contentSecurityPolicy: csp });

  it('sends the shell for a deep route with the production CSP', async () => {
    const response = await handler()(new Request('app://app/library'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('content-security-policy')).toBe(csp);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toContain('<title>shell</title>');
  });

  it('keeps the CSP on refusals and serves no bytes', async () => {
    const response = await handler()(new Request('app://app/assets/linked.txt'));
    expect(response.status).toBe(403);
    expect(response.headers.get('content-security-policy')).toBe(csp);
    expect(await response.text()).toBe('');
  });
});
