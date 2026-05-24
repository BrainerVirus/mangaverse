import { err, ok, type AppResult } from '@app/shared';
import { platformInvalidUrl, platformUnexpected, platformUnsupported } from './errors.js';
import {
  deleteIndexedDbBlob,
  getIndexedDbBlob,
  putIndexedDbBlob,
} from './blob-storage-idb.js';
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
      openTextFile: (options: PlatformFileOpenOptions) => asResult(() => bridge.fileOpenText(options)),
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
      getState: async (): Promise<AppResult<PlatformInstallPromptState>> => ok({ kind: 'unsupported' }),
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
      getItem: async () => err(platformUnsupported('General storage is not yet available on desktop.')),
      setItem: async () => err(platformUnsupported('General storage is not yet available on desktop.')),
      deleteItem: async () => err(platformUnsupported('General storage is not yet available on desktop.')),
      estimate: async () => err(platformUnsupported('General storage is not yet available on desktop.')),
      persist: async () => err(platformUnsupported('General storage is not yet available on desktop.')),
    },

    blobStorage: {
      put: async (key: string, data: ArrayBuffer, mimeType: string) => {
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
    },
  };
}
