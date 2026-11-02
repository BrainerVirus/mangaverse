import { describe, expect, it } from 'vitest';
import { createProviderAllowlist } from './provider-allowlist.js';

describe('createProviderAllowlist', () => {
  it('allows only the hosts a registered provider declared', () => {
    const allowlist = createProviderAllowlist();
    allowlist.register('mangadex', ['api.mangadex.org', '*.mangadex.network']);

    expect(allowlist.allowsUrl('mangadex', 'https://api.mangadex.org/manga')).toBe(true);
    expect(
      allowlist.allowsUrl('mangadex', 'https://cmdxd98sb0x3y.mangadex.network/data/x.png'),
    ).toBe(true);
    expect(allowlist.allowsUrl('mangadex', 'https://mangadex.network/data/x.png')).toBe(false);
    expect(allowlist.allowsUrl('mangadex', 'https://uploads.mangadex.org/x.png')).toBe(false);
    expect(allowlist.allowsUrl('mangadex', 'https://evil.example/x.png')).toBe(false);
  });

  it('refuses an unknown or unregistered provider', () => {
    const allowlist = createProviderAllowlist();

    expect(allowlist.allowsUrl('mangadex', 'https://api.mangadex.org/manga')).toBe(false);

    allowlist.register('mangadex', ['api.mangadex.org']);
    expect(allowlist.allowsUrl('other', 'https://api.mangadex.org/manga')).toBe(false);
  });

  it('refuses a non-http scheme, credentials, a port-only host and a lookalike suffix', () => {
    const allowlist = createProviderAllowlist();
    allowlist.register('mangadex', ['api.mangadex.org', '*.mangadex.network']);

    expect(allowlist.allowsUrl('mangadex', 'file:///etc/passwd')).toBe(false);
    expect(allowlist.allowsUrl('mangadex', 'https://user:pass@api.mangadex.org/')).toBe(false);
    expect(allowlist.allowsUrl('mangadex', 'https://api.mangadex.org.evil.example/')).toBe(false);
    expect(allowlist.allowsUrl('mangadex', 'https://notmangadex.network/')).toBe(false);
    expect(allowlist.allowsUrl('mangadex', 'not a url')).toBe(false);
  });

  it('replaces patterns on re-registration and denies after unregister', () => {
    const allowlist = createProviderAllowlist();
    allowlist.register('mangadex', ['api.mangadex.org']);
    expect(allowlist.allowsUrl('mangadex', 'https://uploads.mangadex.org/x.png')).toBe(false);

    allowlist.register('mangadex', ['api.mangadex.org', 'uploads.mangadex.org']);
    expect(allowlist.allowsUrl('mangadex', 'https://uploads.mangadex.org/x.png')).toBe(true);

    allowlist.unregister('mangadex');
    expect(allowlist.allowsUrl('mangadex', 'https://api.mangadex.org/manga')).toBe(false);
    expect(allowlist.size()).toBe(0);
  });

  it('replaces the whole table and drops ids missing from the snapshot', () => {
    const allowlist = createProviderAllowlist();
    allowlist.register('mangadex', ['api.mangadex.org']);
    allowlist.register('other', ['api.other.example']);

    allowlist.replaceAll([
      { providerId: 'mangadex', domains: ['api.mangadex.org', 'uploads.mangadex.org'] },
    ]);

    expect(allowlist.size()).toBe(1);
    expect(allowlist.allowsUrl('mangadex', 'https://uploads.mangadex.org/x.png')).toBe(true);
    expect(allowlist.allowsUrl('other', 'https://api.other.example/x')).toBe(false);
  });

  it('validates a snapshot before changing anything', () => {
    const allowlist = createProviderAllowlist();
    allowlist.register('mangadex', ['api.mangadex.org']);

    expect(() =>
      allowlist.replaceAll([
        { providerId: 'other', domains: ['api.other.example'] },
        { providerId: 'bad id', domains: ['api.evil.example'] },
      ]),
    ).toThrow(/Invalid provider id/);

    expect(allowlist.size()).toBe(1);
    expect(allowlist.allowsUrl('mangadex', 'https://api.mangadex.org/')).toBe(true);
  });

  it('treats an empty registration as deny-all and normalizes ids and patterns', () => {
    const allowlist = createProviderAllowlist();
    allowlist.register(' MangaDex ', ['API.MangaDex.org']);

    expect(allowlist.patternsFor('mangadex')).toEqual(['api.mangadex.org']);
    expect(allowlist.allowsUrl('MangaDex', 'https://api.mangadex.org/')).toBe(true);

    allowlist.register('mangadex', []);
    expect(allowlist.allowsUrl('mangadex', 'https://api.mangadex.org/')).toBe(false);
  });

  it('rejects an invalid provider id or domain pattern', () => {
    const allowlist = createProviderAllowlist();

    expect(() => allowlist.register('bad id', ['api.mangadex.org'])).toThrow(/Invalid provider id/);
    expect(() => allowlist.register('mangadex', ['https://api.mangadex.org'])).toThrow(
      /Invalid provider network domain/,
    );
    expect(() => allowlist.register('mangadex', ['mangadex.org/path'])).toThrow(
      /Invalid provider network domain/,
    );
  });
});
