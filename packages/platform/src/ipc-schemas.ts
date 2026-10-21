import * as z from 'zod';

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
]);

export type PlatformIpcRequest = z.output<typeof platformIpcRequestSchema>;
