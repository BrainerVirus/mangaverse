import { describe, expect, it } from 'vitest';
import {
  createInstallProtocolStore,
  ingestArgvForInstallUrls,
} from './protocol-handoff.js';

describe('install protocol handoff', () => {
  it('accepts valid install-extension URLs', () => {
    const store = createInstallProtocolStore();
    const r = store.ingestFromRawUrl(
      'mangaverse://install-extension?url=' + encodeURIComponent('https://example.com/a.json'),
    );
    expect(r.ok).toBe(true);
    expect(store.peek()).toBe('https://example.com/a.json');
  });

  it('rejects non-http provider URLs', () => {
    const store = createInstallProtocolStore();
    const r = store.ingestFromRawUrl(
      'mangaverse://install-extension?url=' + encodeURIComponent('file:///etc/passwd'),
    );
    expect(r.ok).toBe(false);
  });

  it('rejects unrelated custom protocol URLs', () => {
    const store = createInstallProtocolStore();
    const r = store.ingestFromRawUrl('mangaverse://other?x=1');
    expect(r.ok).toBe(false);
  });

  it('returns pending URL once without installing anything', () => {
    const store = createInstallProtocolStore();
    store.ingestFromRawUrl(
      'mangaverse://install-extension?url=' + encodeURIComponent('https://x.example/y'),
    );
    expect(store.take()).toBe('https://x.example/y');
    expect(store.take()).toBe(null);
  });

  it('parses argv for mangaverse URLs', () => {
    const store = createInstallProtocolStore();
    ingestArgvForInstallUrls(
      ['app', 'mangaverse://install-extension?url=' + encodeURIComponent('https://z')],
      store,
    );
    expect(store.take()).toBe('https://z');
  });
});
