import { describe, expect, it } from 'vitest';

import { PLATFORM_IPC, type PlatformIpcChannel } from './ipc-channels.js';
import { platformIpcRequestSchema, type PlatformIpcRequest } from './ipc-schemas.js';

const valid: PlatformIpcRequest[] = [
  { channel: PLATFORM_IPC.CAPABILITIES_GET, args: [] },
  { channel: PLATFORM_IPC.CLIPBOARD_READ_TEXT, args: [] },
  { channel: PLATFORM_IPC.CLIPBOARD_WRITE_TEXT, args: ['copied'] },
  { channel: PLATFORM_IPC.FILE_OPEN_TEXT, args: [] },
  { channel: PLATFORM_IPC.FILE_OPEN_TEXT, args: [{ suggestedName: 'notes.md' }] },
  { channel: PLATFORM_IPC.FILE_SAVE_TEXT, args: [{ content: 'backup', suggestedName: 'a.txt' }] },
  { channel: PLATFORM_IPC.FULLSCREEN_ENTER, args: [] },
  { channel: PLATFORM_IPC.FULLSCREEN_EXIT, args: [] },
  { channel: PLATFORM_IPC.FULLSCREEN_IS_ACTIVE, args: [] },
  { channel: PLATFORM_IPC.EXTERNAL_LINK_OPEN, args: ['https://example.com'] },
  { channel: PLATFORM_IPC.PROTOCOL_GET_PENDING_INSTALL_URL, args: [] },
  { channel: PLATFORM_IPC.SECURE_STORAGE_GET, args: ['session.token'] },
  { channel: PLATFORM_IPC.SECURE_STORAGE_SET, args: ['session.token', 'value'] },
  { channel: PLATFORM_IPC.SECURE_STORAGE_DELETE, args: ['session.token'] },
  { channel: PLATFORM_IPC.DIAGNOSTICS_GET, args: [] },
  { channel: PLATFORM_IPC.LOCAL_SERVICE_GET_INFO, args: [] },
  { channel: PLATFORM_IPC.NETWORK_FETCH_BYTES, args: ['https://example.com/page.png'] },
  {
    channel: PLATFORM_IPC.PAGE_STORE_PUT,
    args: ['page:p:m:c:0', new Uint8Array([0xff, 0xd8]).buffer, 'image/jpeg'],
  },
  { channel: PLATFORM_IPC.PAGE_STORE_URL, args: ['page:p:m:c:0'] },
  { channel: PLATFORM_IPC.PAGE_STORE_VERIFY, args: ['page:p:m:c:0'] },
  { channel: PLATFORM_IPC.PAGE_STORE_DELETE, args: ['page:p:m:c:0'] },
  { channel: PLATFORM_IPC.PAGE_STORE_LIST_KEYS, args: [] },
  { channel: PLATFORM_IPC.RENDERER_IMPORT_STATE, args: [] },
  {
    channel: PLATFORM_IPC.RENDERER_IMPORT_COMPLETE,
    args: [
      {
        database: { tables: { library_entries: 1 }, totalRows: 1, checksum: 'a'.repeat(64) },
        blobs: { pages: 1, covers: 1, totalBytes: 4, checksums: { 'page:m:c:0': 'b'.repeat(64) } },
        pointerRewrites: 1,
      },
    ],
  },
  {
    channel: PLATFORM_IPC.PROVIDER_NETWORK_REPLACE,
    args: [
      {
        revision: 1,
        providers: [
          { providerId: 'mangadex', domains: ['api.mangadex.org', '*.mangadex.network'] },
        ],
      },
    ],
  },
  {
    channel: PLATFORM_IPC.PROVIDER_NETWORK_REQUEST,
    args: [
      {
        providerId: 'mangadex',
        url: 'https://api.mangadex.org/manga',
        method: 'GET',
        headers: { accept: 'application/json' },
      },
    ],
  },
  {
    channel: PLATFORM_IPC.PROVIDER_NETWORK_STORE,
    args: [
      {
        providerId: 'mangadex',
        url: 'https://uploads.mangadex.org/page.png',
        key: 'page:mangadex:m:c:0',
      },
    ],
  },
  {
    channel: PLATFORM_IPC.PROVIDER_NETWORK_STORE_USER_INITIATED,
    args: [{ url: 'https://example.com/cover.jpg', key: 'page:cover:mangadex:m' }],
  },
];

const invalid: { channel: PlatformIpcChannel; args: unknown[] }[] = [
  { channel: PLATFORM_IPC.CAPABILITIES_GET, args: ['extra'] },
  { channel: PLATFORM_IPC.CLIPBOARD_READ_TEXT, args: ['extra'] },
  { channel: PLATFORM_IPC.CLIPBOARD_WRITE_TEXT, args: [42] },
  { channel: PLATFORM_IPC.FILE_OPEN_TEXT, args: [{ suggestedName: '/etc/passwd' }] },
  { channel: PLATFORM_IPC.FILE_SAVE_TEXT, args: [{ content: 42 }] },
  { channel: PLATFORM_IPC.FULLSCREEN_ENTER, args: ['extra'] },
  { channel: PLATFORM_IPC.FULLSCREEN_EXIT, args: ['extra'] },
  { channel: PLATFORM_IPC.FULLSCREEN_IS_ACTIVE, args: ['extra'] },
  { channel: PLATFORM_IPC.EXTERNAL_LINK_OPEN, args: ['file:///etc/passwd'] },
  { channel: PLATFORM_IPC.PROTOCOL_GET_PENDING_INSTALL_URL, args: ['extra'] },
  { channel: PLATFORM_IPC.SECURE_STORAGE_GET, args: ['bad key'] },
  { channel: PLATFORM_IPC.SECURE_STORAGE_SET, args: ['session.token', 42] },
  { channel: PLATFORM_IPC.SECURE_STORAGE_DELETE, args: [] },
  { channel: PLATFORM_IPC.DIAGNOSTICS_GET, args: ['extra'] },
  { channel: PLATFORM_IPC.LOCAL_SERVICE_GET_INFO, args: ['extra'] },
  { channel: PLATFORM_IPC.NETWORK_FETCH_BYTES, args: ['http://127.0.0.1/page.png'] },
  {
    channel: PLATFORM_IPC.PAGE_STORE_PUT,
    args: ['page:p:m:c:0', new ArrayBuffer(0), 'image/jpeg'],
  },
  { channel: PLATFORM_IPC.PAGE_STORE_URL, args: ['../../etc/passwd'] },
  { channel: PLATFORM_IPC.PAGE_STORE_VERIFY, args: ['cover:p:m'] },
  { channel: PLATFORM_IPC.PAGE_STORE_DELETE, args: ['cover:p:m'] },
  { channel: PLATFORM_IPC.PAGE_STORE_LIST_KEYS, args: ['extra'] },
  { channel: PLATFORM_IPC.RENDERER_IMPORT_STATE, args: ['extra'] },
  {
    channel: PLATFORM_IPC.RENDERER_IMPORT_COMPLETE,
    args: [{ database: null, blobs: { pages: -1, covers: 0, totalBytes: 0, checksums: {} } }],
  },
  {
    channel: PLATFORM_IPC.PROVIDER_NETWORK_REPLACE,
    args: [
      {
        revision: 1,
        providers: [{ providerId: 'mangadex', domains: ['https://api.mangadex.org'] }],
      },
    ],
  },
  {
    channel: PLATFORM_IPC.PROVIDER_NETWORK_REPLACE,
    args: [
      {
        revision: 1,
        providers: [{ providerId: 'mangadex', domains: ['api.mangadex.org'], extra: true }],
      },
    ],
  },
  {
    channel: PLATFORM_IPC.PROVIDER_NETWORK_REPLACE,
    args: [{ revision: -1, providers: [] }],
  },
  {
    channel: PLATFORM_IPC.PROVIDER_NETWORK_REQUEST,
    args: [{ providerId: 'mangadex', url: 'http://127.0.0.1/manga' }],
  },
  {
    channel: PLATFORM_IPC.PROVIDER_NETWORK_REQUEST,
    args: [{ providerId: 'mangadex', url: 'https://api.mangadex.org/manga', method: 'TRACE' }],
  },
  {
    channel: PLATFORM_IPC.PROVIDER_NETWORK_REQUEST,
    args: [
      {
        providerId: 'mangadex',
        url: 'https://api.mangadex.org/manga',
        headers: { accept: 'x\r\nHost: evil.example' },
      },
    ],
  },
  {
    channel: PLATFORM_IPC.PROVIDER_NETWORK_STORE,
    args: [
      { providerId: 'mangadex', url: 'https://uploads.mangadex.org/page.png', key: 'cover:x:y' },
    ],
  },
  {
    channel: PLATFORM_IPC.PROVIDER_NETWORK_STORE_USER_INITIATED,
    args: [{ url: 'http://127.0.0.1/cover.jpg', key: 'page:cover:mangadex:m' }],
  },
  {
    channel: PLATFORM_IPC.PROVIDER_NETWORK_STORE_USER_INITIATED,
    args: [{ url: 'https://example.com/cover.jpg', key: 'cover:x:y' }],
  },
];

describe('platformIpcRequestSchema', () => {
  it.each(valid)('accepts a valid $channel payload', (request) => {
    expect(platformIpcRequestSchema.safeParse(request).success).toBe(true);
  });

  it.each(invalid)('rejects an invalid $channel payload', (request) => {
    expect(platformIpcRequestSchema.safeParse(request).success).toBe(false);
  });

  it('covers every channel in both tables', () => {
    const channels = new Set(Object.values(PLATFORM_IPC));
    expect(new Set(valid.map((request) => request.channel))).toEqual(channels);
    expect(new Set(invalid.map((request) => request.channel))).toEqual(channels);
  });

  it.each(['/etc/passwd', '../escape.txt', 'C:\\secret.txt', 'dir/file.txt', '..', ''])(
    'rejects defaultPath %j',
    (defaultPath) => {
      const result = platformIpcRequestSchema.safeParse({
        channel: PLATFORM_IPC.FILE_SAVE_TEXT,
        args: [{ content: 'x', defaultPath }],
      });
      expect(result.success).toBe(false);
    },
  );

  it.each([
    'http://localhost/x',
    'http://[::1]/x',
    'http://10.0.0.1/x',
    'http://192.168.1.1/x',
    'http://169.254.169.254/latest',
  ])('rejects the private network target %s at the schema boundary', (url) => {
    expect(
      platformIpcRequestSchema.safeParse({
        channel: PLATFORM_IPC.NETWORK_FETCH_BYTES,
        args: [url],
      }).success,
    ).toBe(false);
  });
});
