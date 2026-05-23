import { describe, expect, it, vi } from 'vitest';

import { fetchAndValidateManifestFromUrl, fetchManifestFromUrl } from './manifest-fetch';

const validJson = {
  id: 'demo',
  name: 'Demo Provider',
  version: '1.0.0',
  source: { url: 'https://example.com' },
  compatibility: { platforms: ['web', 'desktop'] },
  capabilities: { 'discovery.search': true, 'metadata.details': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

describe('fetchManifestFromUrl', () => {
  it('rejects javascript content-type', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/javascript' } }));
    const r = await fetchManifestFromUrl('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('extensions.core.fetch.code_response');
  });

  it('rejects ecmascript content-type', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'text/ecmascript' } }));
    const r = await fetchManifestFromUrl('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('extensions.core.fetch.code_response');
  });

  it('returns json body', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ a: 1 }), { status: 200 }));
    const r = await fetchManifestFromUrl('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.json).toEqual({ a: 1 });
  });

  it('rejects invalid JSON', async () => {
    const fetch = vi.fn(async () => new Response('not valid json', { status: 200 }));
    const r = await fetchManifestFromUrl('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('extensions.core.fetch.invalid_json');
  });

  it('rejects oversized body exceeding default 256000 bytes', async () => {
    const largeBody = 'x'.repeat(256_001);
    const fetch = vi.fn(async () => new Response(largeBody, { status: 200 }));
    const r = await fetchManifestFromUrl('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('extensions.core.fetch.body_too_large');
  });

  it('rejects oversized body exceeding custom maxManifestBytes', async () => {
    const body = 'x'.repeat(101);
    const fetch = vi.fn(async () => new Response(body, { status: 200 }));
    const r = await fetchManifestFromUrl('https://example.com/m.json', { fetch, maxManifestBytes: 100 });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('extensions.core.fetch.body_too_large');
  });

  it('rejects body by UTF-8 byte length, not string length', async () => {
    const body = JSON.stringify({ value: 'é'.repeat(60) });
    const fetch = vi.fn(async () => new Response(body, { status: 200 }));

    const r = await fetchManifestFromUrl('https://example.com/m.json', {
      fetch,
      maxManifestBytes: 100,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('extensions.core.fetch.body_too_large');
  });

  it('accepts body within custom maxManifestBytes', async () => {
    const body = JSON.stringify({ ok: true });
    const fetch = vi.fn(async () => new Response(body, { status: 200 }));
    const r = await fetchManifestFromUrl('https://example.com/m.json', { fetch, maxManifestBytes: 100 });
    expect(r.ok).toBe(true);
  });

  it('stores raw text for checksum verification', async () => {
    const originalText = JSON.stringify({ checksum: 'test' });
    const fetch = vi.fn(async () => new Response(originalText, { status: 200 }));

    const r = await fetchManifestFromUrl('https://example.com/m.json', { fetch });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.rawText).toBe(originalText);
      expect(r.value.json).toEqual({ checksum: 'test' });
    }
  });
});

describe('fetchAndValidateManifestFromUrl', () => {
  it('validates manifest', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(validJson), { status: 200 }));
    const r = await fetchAndValidateManifestFromUrl('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe('Demo Provider');
  });

  it('rejects oversized body', async () => {
    const largeBody = 'x'.repeat(256_001);
    const fetch = vi.fn(async () => new Response(largeBody, { status: 200 }));
    const r = await fetchAndValidateManifestFromUrl('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('extensions.core.fetch.body_too_large');
  });
});