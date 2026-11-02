import { err, ok, type AppResult } from '@app/shared';
import { platformInvalidUrl, platformUnexpected, platformUnsupported } from './errors.js';
import {
  deleteIndexedDbBlob,
  getIndexedDbBlob,
  listIndexedDbBlobKeys,
  putIndexedDbBlob,
} from './blob-storage-idb.js';
import { isPageStoreKey } from './ipc-schemas.js';
import { isValidSecureStorageKey } from './secure-storage-key.js';
import type {
  DesktopPlatformBridge,
  PlatformAdapter,
  PlatformFileOpenOptions,
  PlatformInstallPromptState,
} from './types.js';
import { isSafeExternalUrl } from './url-protocol.js';

async function asResult<T>(fn: () => Promise<AppResult<T>>): Promise<AppResult<T>> {
  try {
    return await fn();
  } catch (e) {
    return err(platformUnexpected('Desktop platform bridge call failed.', e));
  }
}

export function createElectronPlatformAdapter(bridge: DesktopPlatformBridge): PlatformAdapter {
  return {
    capabilities: () => asResult(() => bridge.getCapabilities()),

    clipboard: {
      readText: () => asResult(() => bridge.clipboardReadText()),
      writeText: (text: string) => asResult(() => bridge.clipboardWriteText(text)),
    },

    files: {
      openTextFile: (options: PlatformFileOpenOptions) =>
        asResult(() => bridge.fileOpenText(options)),
      saveTextFile: (options) => asResult(() => bridge.fileSaveText(options)),
    },

    fullscreen: {
      enter: () => asResult(() => bridge.fullscreenEnter()),
      exit: () => asResult(() => bridge.fullscreenExit()),
      isActive: () => asResult(() => bridge.fullscreenIsActive()),
    },

    protocol: {
      getPendingInstallUrl: () => asResult(() => bridge.protocolGetPendingInstallUrl()),
      canHandleInstallLinks: async () => ok(true),
    },

    externalLinks: {
      open: async (url: string) => {
        if (!isSafeExternalUrl(url)) {
          return err(platformInvalidUrl('Only http and https URLs can be opened.'));
        }
        return asResult(() => bridge.externalLinkOpen(url));
      },
    },

    installPrompt: {
      getState: async (): Promise<AppResult<PlatformInstallPromptState>> =>
        ok({ kind: 'unsupported' }),
      prompt: async () => err(platformUnsupported('Install prompt is not used on desktop.')),
    },

    secureStorage: {
      get: async (key: string) => {
        if (!isValidSecureStorageKey(key)) {
          return err(platformInvalidUrl('Secure storage key is invalid.'));
        }
        return asResult(() => bridge.secureStorageGet(key));
      },
      set: async (key: string, value: string) => {
        if (!isValidSecureStorageKey(key)) {
          return err(platformInvalidUrl('Secure storage key is invalid.'));
        }
        return asResult(() => bridge.secureStorageSet(key, value));
      },
      delete: async (key: string) => {
        if (!isValidSecureStorageKey(key)) {
          return err(platformInvalidUrl('Secure storage key is invalid.'));
        }
        return asResult(() => bridge.secureStorageDelete(key));
      },
    },

    diagnostics: {
      getSnapshot: () => asResult(() => bridge.diagnosticsGetSnapshot()),
    },

    localService: {
      getInfo: () => asResult(() => bridge.localServiceGetInfo()),
    },

    storage: {
      getItem: async () =>
        err(platformUnsupported('General storage is not yet available on desktop.')),
      setItem: async () =>
        err(platformUnsupported('General storage is not yet available on desktop.')),
      deleteItem: async () =>
        err(platformUnsupported('General storage is not yet available on desktop.')),
      estimate: async () =>
        err(platformUnsupported('General storage is not yet available on desktop.')),
      persist: async () =>
        err(platformUnsupported('General storage is not yet available on desktop.')),
    },

    blobStorage: {
      put: async (key: string, data: ArrayBuffer, mimeType: string) => {
        if (isPageStoreKey(key)) {
          const stored = await asResult(() => bridge.pageStorePut(key, data, mimeType));
          return stored.ok ? ok(undefined) : stored;
        }
        if (typeof globalThis.indexedDB === 'undefined') {
          return err(platformUnsupported('Blob storage is not available on desktop.'));
        }
        try {
          await putIndexedDbBlob(key, data, mimeType, { indexedDB: globalThis.indexedDB });
          return ok(undefined);
        } catch {
          return err(platformUnsupported('Could not store blob on desktop.'));
        }
      },
      get: async (key: string) => {
        if (isPageStoreKey(key)) {
          return err(platformUnsupported('Pages are served by the page store, not read back.'));
        }
        if (typeof globalThis.indexedDB === 'undefined') {
          return err(platformUnsupported('Blob storage is not available on desktop.'));
        }
        try {
          const record = await getIndexedDbBlob(key, { indexedDB: globalThis.indexedDB });
          return ok(record);
        } catch {
          return err(platformUnsupported('Could not read blob on desktop.'));
        }
      },
      delete: async (key: string) => {
        if (isPageStoreKey(key)) return asResult(() => bridge.pageStoreDelete(key));
        if (typeof globalThis.indexedDB === 'undefined') {
          return err(platformUnsupported('Blob storage is not available on desktop.'));
        }
        try {
          await deleteIndexedDbBlob(key, { indexedDB: globalThis.indexedDB });
          return ok(undefined);
        } catch {
          return err(platformUnsupported('Could not delete blob on desktop.'));
        }
      },
      listKeys: async () => {
        const pages = await asResult(() => bridge.pageStoreListKeys());
        if (!pages.ok) return pages;
        if (typeof globalThis.indexedDB === 'undefined') {
          return err(platformUnsupported('Blob storage is not available on desktop.'));
        }
        try {
          // Page blobs left in IndexedDB by earlier versions are not this store's: the
          // renderer-data import (#213) owns them, so the sweep never sees them.
          const blobs = await listIndexedDbBlobKeys({ indexedDB: globalThis.indexedDB });
          return ok([...blobs.filter((key) => !isPageStoreKey(key)), ...pages.value]);
        } catch {
          return err(platformUnsupported('Could not list blobs on desktop.'));
        }
      },
      createObjectUrl: async (data: ArrayBuffer, mimeType: string) => {
        if (typeof URL === 'undefined' || typeof Blob === 'undefined') {
          return err(platformUnsupported('Object URLs are not available on desktop.'));
        }
        try {
          const blob = new Blob([data], { type: mimeType });
          return ok(URL.createObjectURL(blob));
        } catch {
          return err(platformUnsupported('Could not create object URL on desktop.'));
        }
      },
      revokeObjectUrl: async (url: string) => {
        // A page:// URL names a stored file, not an object URL: nothing to release.
        if (!url.startsWith('blob:')) return ok(undefined);
        if (typeof URL === 'undefined') {
          return err(platformUnsupported('Object URLs are not available on desktop.'));
        }
        try {
          URL.revokeObjectURL(url);
          return ok(undefined);
        } catch {
          return err(platformUnsupported('Could not revoke object URL on desktop.'));
        }
      },
      resolveUrl: async (key: string) => {
        if (!isPageStoreKey(key)) {
          return err(platformUnsupported('Only pages are served by URL on desktop.'));
        }
        return asResult(() => bridge.pageStoreUrl(key));
      },
    },

    network: {
      fetchBytes: (url: string) => asResult(() => bridge.networkFetchBytes(url)),
    },
  };
}
