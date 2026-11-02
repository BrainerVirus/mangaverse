import { describe, expect, it } from 'vitest';
import { createProviderAllowlist } from './provider-allowlist.js';

function allowlistWith(providers: Record<string, readonly string[]>) {
  const allowlist = createProviderAllowlist();
  allowlist.replaceAll(
    Object.entries(providers).map(([providerId, domains]) => ({ providerId, domains })),
  );
  return allowlist;
}

describe('createProviderAllowlist', () => {
  it('allows only the hosts a registered provider declared', () => {
    const allowlist = allowlistWith({ mangadex: ['api.mangadex.org', '*.mangadex.network'] });

    expect(allowlist.allowsUrl('mangadex', 'https://api.mangadex.org/manga')).toBe(true);
    expect(
      allowlist.allowsUrl('mangadex', 'https://cmdxd98sb0x3y.mangadex.network/data/x.png'),
    ).toBe(true);
    expect(allowlist.allowsUrl('mangadex', 'https://mangadex.network/data/x.png')).toBe(false);
    expect(allowlist.allowsUrl('mangadex', 'https://uploads.mangadex.org/x.png')).toBe(false);
    expect(allowlist.allowsUrl('mangadex', 'https://evil.example/x.png')).toBe(false);
  });

  it('refuses every provider before the first snapshot, and an unknown one after', () => {
    const allowlist = createProviderAllowlist();

    expect(allowlist.allowsUrl('mangadex', 'https://api.mangadex.org/manga')).toBe(false);

    allowlist.replaceAll([{ providerId: 'mangadex', domains: ['api.mangadex.org'] }]);
    expect(allowlist.allowsUrl('other', 'https://api.mangadex.org/manga')).toBe(false);
  });

  it('refuses a non-http scheme, credentials, a port-only host and a lookalike suffix', () => {
    const allowlist = allowlistWith({ mangadex: ['api.mangadex.org', '*.mangadex.network'] });

    expect(allowlist.allowsUrl('mangadex', 'file:///etc/passwd')).toBe(false);
    expect(allowlist.allowsUrl('mangadex', 'https://user:pass@api.mangadex.org/')).toBe(false);
    expect(allowlist.allowsUrl('mangadex', 'https://api.mangadex.org.evil.example/')).toBe(false);
    expect(allowlist.allowsUrl('mangadex', 'https://notmangadex.network/')).toBe(false);
    expect(allowlist.allowsUrl('mangadex', 'not a url')).toBe(false);
  });

  it('replaces the whole table and drops ids missing from the snapshot', () => {
    const allowlist = allowlistWith({
      mangadex: ['api.mangadex.org'],
      other: ['api.other.example'],
    });

    allowlist.replaceAll([
      { providerId: 'mangadex', domains: ['api.mangadex.org', 'uploads.mangadex.org'] },
    ]);

    expect(allowlist.size()).toBe(1);
    expect(allowlist.allowsUrl('mangadex', 'https://uploads.mangadex.org/x.png')).toBe(true);
    expect(allowlist.allowsUrl('other', 'https://api.other.example/x')).toBe(false);
  });

  it('revokes one provider and leaves the others', () => {
    const allowlist = allowlistWith({
      mangadex: ['api.mangadex.org'],
      other: ['api.other.example'],
    });

    allowlist.revoke(' MangaDex ');

    expect(allowlist.allowsUrl('mangadex', 'https://api.mangadex.org/manga')).toBe(false);
    expect(allowlist.allowsUrl('other', 'https://api.other.example/x')).toBe(true);
    expect(allowlist.size()).toBe(1);
  });

  it('validates a snapshot before changing anything', () => {
    const allowlist = allowlistWith({ mangadex: ['api.mangadex.org'] });

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
    const allowlist = allowlistWith({ ' MangaDex ': ['API.MangaDex.org'] });

    expect(allowlist.patternsFor('mangadex')).toEqual(['api.mangadex.org']);
    expect(allowlist.allowsUrl('MangaDex', 'https://api.mangadex.org/')).toBe(true);

    allowlist.replaceAll([{ providerId: 'mangadex', domains: [] }]);
    expect(allowlist.allowsUrl('mangadex', 'https://api.mangadex.org/')).toBe(false);
  });

  it('rejects an invalid domain pattern', () => {
    const allowlist = createProviderAllowlist();

    expect(() =>
      allowlist.replaceAll([{ providerId: 'mangadex', domains: ['https://api.mangadex.org'] }]),
    ).toThrow(/Invalid provider network domain/);
    expect(() =>
      allowlist.replaceAll([{ providerId: 'mangadex', domains: ['mangadex.org/path'] }]),
    ).toThrow(/Invalid provider network domain/);
  });

  it('reports a host any registered provider claims, with the same matching', () => {
    const allowlist = allowlistWith({
      mangadex: ['api.mangadex.org', '*.mangadex.network'],
      other: ['api.other.example'],
    });

    expect(allowlist.claimedByAnyProvider('https://api.mangadex.org/cover.png')).toBe(true);
    expect(allowlist.claimedByAnyProvider('http://API.MangaDex.org:8080/cover.png')).toBe(true);
    expect(allowlist.claimedByAnyProvider('https://x.mangadex.network/a.png')).toBe(true);
    expect(allowlist.claimedByAnyProvider('https://api.other.example/a.png')).toBe(true);
    expect(allowlist.claimedByAnyProvider('https://images.example.com/a.png')).toBe(false);
    expect(allowlist.claimedByAnyProvider('https://api.mangadex.org.evil.example/')).toBe(false);
  });
});
