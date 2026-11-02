import * as z from 'zod';

import { isProviderDomainPattern } from '@app/shared';
import { PLATFORM_IPC, type PlatformIpcChannel } from './ipc-channels.js';
import { isSafeNetworkFetchUrl } from './network-url.js';
import { isValidSecureStorageKey } from './secure-storage-key.js';
import { isSafeExternalUrl } from './url-protocol.js';

/**
 * Payloads the renderer may send over a platform IPC channel. Every channel has
 * an entry, so a channel without arguments still rejects extra ones.
 */

const fileName = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      value.trim().length > 0 &&
      !/[/\\:]/.test(value) &&
      !value.includes('\0') &&
      value !== '.' &&
      value !== '..',
    { error: 'must be a plain file name' },
  );

const secureStorageKey = z.string().refine(isValidSecureStorageKey, {
  error: 'invalid secure storage key',
});

const fileOpenOptions = z
  .object({
    suggestedName: fileName.optional(),
    acceptDescription: z.string().max(200).optional(),
  })
  .strict();

const fileSaveOptions = z
  .object({
    suggestedName: fileName.optional(),
    defaultPath: fileName.optional(),
    content: z.string(),
  })
  .strict();

/** Main's page store keeps only page blobs; the key names the page, never a path. */
export const PAGE_STORE_KEY_PREFIX = 'page:';
const MAX_PAGE_STORE_KEY_LENGTH = 1024;
/** One page; matches the main store's own bound. */
export const MAX_PAGE_STORE_BYTES = 64 * 1024 * 1024;

export function isPageStoreKey(key: string): boolean {
  return (
    key.startsWith(PAGE_STORE_KEY_PREFIX) &&
    key.length <= MAX_PAGE_STORE_KEY_LENGTH &&
    !key.includes('\0')
  );
}

const pageStoreKey = z.string().refine(isPageStoreKey, { error: 'invalid page store key' });

/** The renderer registers a provider's manifest-declared domains; a request never carries them. */
export const providerNetworkProviderId = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .refine((value) => /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value), {
    error: 'invalid provider id',
  });

const providerNetworkDomain = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .refine(isProviderDomainPattern, { error: 'invalid provider domain pattern' });

const providerNetworkRegistration = z
  .object({
    providerId: providerNetworkProviderId,
    domains: z.array(providerNetworkDomain).max(32),
  })
  .strict();

/** The renderer's complete enabled-provider table; main replaces its own with it. */
const providerNetworkReplace = z
  .object({
    revision: z.number().int().nonnegative(),
    providers: z.array(providerNetworkRegistration).max(64),
  })
  .strict();

/** One provider to drop from main's table now; the revision fences older snapshots. */
const providerNetworkRevoke = z
  .object({
    revision: z.number().int().nonnegative(),
    providerId: providerNetworkProviderId,
  })
  .strict();

const MAX_PROVIDER_REQUEST_BODY = 1_024_000;
/** A provider request may name a timeout, but never one longer than main's own deadline. */
const MAX_PROVIDER_REQUEST_TIMEOUT_MS = 60_000;

const providerRequestHeaderName = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => !/[\r\n:]/.test(value), { error: 'invalid header name' });
const providerRequestHeaderValue = z
  .string()
  .max(1024)
  .refine((value) => !/[\r\n]/.test(value), { error: 'invalid header value' });

const providerNetworkStore = z
  .object({
    providerId: providerNetworkProviderId,
    url: z
      .string()
      .max(4096)
      .refine(isSafeNetworkFetchUrl, { error: 'must be a public http or https URL' }),
    key: pageStoreKey,
  })
  .strict();

/**
 * A user-supplied cover: no provider allowlist, but still a public http(s) URL.
 * Main also refuses any host a registered provider declares.
 */
const providerNetworkStoreUserInitiated = z
  .object({
    url: z
      .string()
      .max(4096)
      .refine(isSafeNetworkFetchUrl, { error: 'must be a public http or https URL' }),
    key: pageStoreKey,
  })
  .strict();

const providerNetworkRequest = z
  .object({
    providerId: providerNetworkProviderId,
    url: z
      .string()
      .max(4096)
      .refine(isSafeNetworkFetchUrl, { error: 'must be a public http or https URL' }),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).optional(),
    headers: z
      .record(providerRequestHeaderName, providerRequestHeaderValue)
      .refine((value) => Object.keys(value).length <= 32, { error: 'too many request headers' })
      .optional(),
    body: z.string().max(MAX_PROVIDER_REQUEST_BODY).optional(),
    timeoutMs: z.number().int().min(1).max(MAX_PROVIDER_REQUEST_TIMEOUT_MS).optional(),
  })
  .strict();

// Structured clone hands main an ArrayBuffer or a typed array, depending on what was sent.
const pageBytes = z
  .union([z.instanceof(ArrayBuffer), z.instanceof(Uint8Array)])
  .refine((value) => value.byteLength > 0 && value.byteLength <= MAX_PAGE_STORE_BYTES, {
    error: 'page size is out of bounds',
  });

const importReport = z
  .object({
    tables: z.record(z.string(), z.number().int().nonnegative()),
    totalRows: z.number().int().nonnegative(),
    checksum: z.string().max(128),
  })
  .strict();

/** What the renderer-data import verified, recorded beside the native database. */
export const rendererImportReport = z
  .object({
    database: importReport.nullable(),
    blobs: z
      .object({
        pages: z.number().int().nonnegative(),
        covers: z.number().int().nonnegative(),
        totalBytes: z.number().int().nonnegative(),
        checksums: z.record(z.string(), z.string().max(128)),
      })
      .strict(),
    pointerRewrites: z.number().int().nonnegative(),
  })
  .strict();

export type RendererImportReport = z.output<typeof rendererImportReport>;

function request<C extends PlatformIpcChannel, A extends z.ZodType>(channel: C, args: A) {
  return z.object({ channel: z.literal(channel), args });
}

export const platformIpcRequestSchema = z.discriminatedUnion('channel', [
  request(PLATFORM_IPC.CAPABILITIES_GET, z.tuple([])),
  request(PLATFORM_IPC.CLIPBOARD_READ_TEXT, z.tuple([])),
  request(PLATFORM_IPC.CLIPBOARD_WRITE_TEXT, z.tuple([z.string()])),
  request(PLATFORM_IPC.FILE_OPEN_TEXT, z.tuple([fileOpenOptions.optional()])),
  request(PLATFORM_IPC.FILE_SAVE_TEXT, z.tuple([fileSaveOptions])),
  request(PLATFORM_IPC.FULLSCREEN_ENTER, z.tuple([])),
  request(PLATFORM_IPC.FULLSCREEN_EXIT, z.tuple([])),
  request(PLATFORM_IPC.FULLSCREEN_IS_ACTIVE, z.tuple([])),
  request(
    PLATFORM_IPC.EXTERNAL_LINK_OPEN,
    z.tuple([z.string().refine(isSafeExternalUrl, { error: 'must be an http or https URL' })]),
  ),
  request(PLATFORM_IPC.PROTOCOL_GET_PENDING_INSTALL_URL, z.tuple([])),
  request(PLATFORM_IPC.SECURE_STORAGE_GET, z.tuple([secureStorageKey])),
  request(PLATFORM_IPC.SECURE_STORAGE_SET, z.tuple([secureStorageKey, z.string()])),
  request(PLATFORM_IPC.SECURE_STORAGE_DELETE, z.tuple([secureStorageKey])),
  request(PLATFORM_IPC.DIAGNOSTICS_GET, z.tuple([])),
  request(PLATFORM_IPC.LOCAL_SERVICE_GET_INFO, z.tuple([])),
  request(
    PLATFORM_IPC.NETWORK_FETCH_BYTES,
    z.tuple([
      z.string().refine(isSafeNetworkFetchUrl, { error: 'must be a public http or https URL' }),
    ]),
  ),
  request(PLATFORM_IPC.PAGE_STORE_PUT, z.tuple([pageStoreKey, pageBytes, z.string().max(255)])),
  request(PLATFORM_IPC.PAGE_STORE_URL, z.tuple([pageStoreKey])),
  request(PLATFORM_IPC.PAGE_STORE_VERIFY, z.tuple([pageStoreKey])),
  request(PLATFORM_IPC.PAGE_STORE_DELETE, z.tuple([pageStoreKey])),
  request(PLATFORM_IPC.PAGE_STORE_LIST_KEYS, z.tuple([])),
  request(PLATFORM_IPC.RENDERER_IMPORT_STATE, z.tuple([])),
  request(PLATFORM_IPC.RENDERER_IMPORT_COMPLETE, z.tuple([rendererImportReport])),
  request(PLATFORM_IPC.UPDATE_SET_READER_ACTIVE, z.tuple([z.boolean()])),
  request(PLATFORM_IPC.UPDATE_INSTALL, z.tuple([])),
  request(PLATFORM_IPC.UPDATE_DISMISS, z.tuple([])),
  request(PLATFORM_IPC.PROVIDER_NETWORK_REPLACE, z.tuple([providerNetworkReplace])),
  request(PLATFORM_IPC.PROVIDER_NETWORK_REVOKE, z.tuple([providerNetworkRevoke])),
  request(PLATFORM_IPC.PROVIDER_NETWORK_NEXT_REVISION, z.tuple([])),
  request(PLATFORM_IPC.PROVIDER_NETWORK_REQUEST, z.tuple([providerNetworkRequest])),
  request(PLATFORM_IPC.PROVIDER_NETWORK_STORE, z.tuple([providerNetworkStore])),
  request(
    PLATFORM_IPC.PROVIDER_NETWORK_STORE_USER_INITIATED,
    z.tuple([providerNetworkStoreUserInitiated]),
  ),
]);

export type PlatformIpcRequest = z.output<typeof platformIpcRequestSchema>;
