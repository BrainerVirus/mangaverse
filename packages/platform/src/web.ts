import { err, ok, type AppResult } from '@app/shared';
import { detectWebCapabilities } from './capabilities.js';
import {
  deleteIndexedDbBlob,
  getIndexedDbBlob,
  putIndexedDbBlob,
} from './blob-storage-idb.js';
import {
  platformInvalidUrl,
  platformPermissionDenied,
  platformUnsupported,
} from './errors.js';
import type {
  PlatformAdapter,
  PlatformCapabilities,
  PlatformDiagnosticsSnapshot,
  PlatformFileOpenOptions,
  PlatformFileSaveOptions,
  PlatformFileResult,
  PlatformInstallPromptState,
  PlatformStorageEstimate,
  WebPlatformEnvironment,
} from './types.js';
import { isSafeExternalUrl } from './url-protocol.js';

function resolveWebEnvironment(environment?: WebPlatformEnvironment): WebPlatformEnvironment {
  if (environment) {
    return environment;
  }

  if (typeof globalThis.window === 'undefined' || typeof globalThis.document === 'undefined') {
    return {};
  }

  const w = globalThis.window;
  const doc = globalThis.document;

  return {
    getDocumentElement: () => doc.documentElement,
    requestFullscreen: (el: Element) => {
      const anyEl = el as HTMLElement & {
        requestFullscreen?: () => Promise<void>;
        webkitRequestFullscreen?: () => Promise<void>;
      };
      const fn = anyEl.requestFullscreen ?? anyEl.webkitRequestFullscreen;
      if (!fn) {
        return Promise.reject(new Error('requestFullscreen unsupported'));
      }
      return fn.call(anyEl);
    },
    exitFullscreen: () => {
      const anyDoc = doc as Document & {
        exitFullscreen?: () => Promise<void>;
        webkitExitFullscreen?: () => Promise<void>;
      };
      const fn = anyDoc.exitFullscreen ?? anyDoc.webkitExitFullscreen;
      if (!fn) {
        return Promise.reject(new Error('exitFullscreen unsupported'));
      }
      return fn.call(anyDoc);
    },
    getFullscreenElement: () => doc.fullscreenElement,
    ...(globalThis.navigator?.clipboard
      ? {
          navigatorClipboard: {
            readText: () => globalThis.navigator!.clipboard!.readText(),
            writeText: (text: string) => globalThis.navigator!.clipboard!.writeText(text),
          },
        }
      : {}),
    windowOpen: (url: string) => {
      w.open(url, '_blank', 'noopener,noreferrer');
    },
    locationAssign: (url: string) => {
      w.location.assign(url);
    },
    createObjectUrl: (blob: Blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url: string) => URL.revokeObjectURL(url),
    createDownload: (filename: string, href: string) => {
      const a = doc.createElement('a');
      a.href = href;
      a.download = filename;
      a.rel = 'noopener';
      a.click();
    },
    ...(typeof globalThis.navigator === 'object' &&
    globalThis.navigator !== null &&
    'registerProtocolHandler' in globalThis.navigator
      ? {
          getRegisterProtocolHandler: () =>
            globalThis.navigator.registerProtocolHandler.bind(globalThis.navigator),
        }
      : {}),
    ...(typeof globalThis.localStorage !== 'undefined'
      ? {
          localStorage: {
            getItem: (key: string) => globalThis.localStorage.getItem(key),
            setItem: (key: string, value: string) => globalThis.localStorage.setItem(key, value),
            removeItem: (key: string) => globalThis.localStorage.removeItem(key),
          },
        }
      : {}),
    ...(typeof globalThis.navigator !== 'undefined' && 'storage' in globalThis.navigator
      ? {
          storageManager: {
            estimate: () => (globalThis.navigator as Navigator & { storage: StorageManager }).storage.estimate(),
            persist: () => (globalThis.navigator as Navigator & { storage: StorageManager }).storage.persist(),
            persisted: () => (globalThis.navigator as Navigator & { storage: StorageManager }).storage.persisted(),
          },
        }
      : {}),
    ...(typeof globalThis.indexedDB !== 'undefined' ? { indexedDB: globalThis.indexedDB } : {}),
  };
}

export function createWebPlatformAdapter(environment?: WebPlatformEnvironment): PlatformAdapter {
  const env = resolveWebEnvironment(environment);

  const capabilitiesSnapshot = (): PlatformCapabilities => {
    const derivedProbe: WebPlatformEnvironment['capabilityProbe'] = {
      hasClipboardRead: Boolean(env.navigatorClipboard?.readText),
      hasClipboardWrite: Boolean(env.navigatorClipboard?.writeText),
      fullscreenEnabled: Boolean(env.requestFullscreen && env.exitFullscreen),
      hasRegisterProtocolHandler: Boolean(env.getRegisterProtocolHandler?.()),
      installPromptObservable: Boolean(env.getInstallPromptAvailable || env.subscribeBeforeInstallPrompt),
      isSecureContext: Boolean(globalThis.isSecureContext),
      hasLocalStorage: Boolean(env.localStorage),
      hasStorageEstimate: Boolean(env.storageManager?.estimate),
      hasStoragePersist: Boolean(env.storageManager?.persist),
      hasDownload: Boolean(env.createObjectUrl && env.revokeObjectUrl && env.createDownload),
    };
    return detectWebCapabilities({ ...derivedProbe, ...env.capabilityProbe });
  };

  let installPromptHandler: { prompt: () => Promise<void> } | null = null;
  env.subscribeBeforeInstallPrompt?.((event) => {
    installPromptHandler = event;
  });

  return {
    capabilities: async () => ok(capabilitiesSnapshot()),

    clipboard: {
      readText: async () => {
        if (!env.navigatorClipboard?.readText) {
          return err(platformUnsupported('Clipboard read is not available in this browser.'));
        }
        try {
          return ok(await env.navigatorClipboard.readText());
        } catch {
          return err(platformPermissionDenied('Clipboard read was denied.'));
        }
      },
      writeText: async (text: string) => {
        if (!env.navigatorClipboard?.writeText) {
          return err(platformUnsupported('Clipboard write is not available in this browser.'));
        }
        try {
          await env.navigatorClipboard.writeText(text);
          return ok(undefined);
        } catch {
          return err(platformPermissionDenied('Clipboard write was denied.'));
        }
      },
    },

    files: {
      openTextFile: async (_options: PlatformFileOpenOptions) =>
        err(
          platformUnsupported(
            'Native file open is not available in the browser. Provide a file input in the UI and read the file in app code.',
          ),
        ),
      saveTextFile: async (options: PlatformFileSaveOptions) => {
        if (!env.createObjectUrl || !env.revokeObjectUrl || !env.createDownload) {
          return err(platformUnsupported('File download APIs are not available in this environment.'));
        }
        try {
          const blob = new Blob([options.content], { type: 'text/plain;charset=utf-8' });
          const href = env.createObjectUrl(blob);
          try {
            const name = options.suggestedName ?? 'download.txt';
            env.createDownload(name, href);
          } finally {
            env.revokeObjectUrl(href);
          }
          const result: PlatformFileResult = { content: options.content };
          return ok(result);
        } catch {
          return err(platformUnsupported('Could not start download.'));
        }
      },
    },

    fullscreen: {
      enter: async () => {
        const el = env.getDocumentElement?.() ?? null;
        if (!el || !env.requestFullscreen) {
          return err(platformUnsupported('Fullscreen is not available in this browser.'));
        }
        try {
          await env.requestFullscreen(el);
          return ok(undefined);
        } catch {
          return err(platformPermissionDenied('Fullscreen request was denied.'));
        }
      },
      exit: async () => {
        if (!env.exitFullscreen) {
          return err(platformUnsupported('Fullscreen exit is not available in this browser.'));
        }
        try {
          await env.exitFullscreen();
          return ok(undefined);
        } catch {
          return err(platformUnsupported('Could not exit fullscreen.'));
        }
      },
      isActive: async () => {
        const fs = env.getFullscreenElement?.() ?? null;
        return ok(Boolean(fs));
      },
    },

    protocol: {
      getPendingInstallUrl: async () => ok(null),
      canHandleInstallLinks: async () => ok(Boolean(env.getRegisterProtocolHandler?.())),
    },

    externalLinks: {
      open: async (url: string) => {
        if (!isSafeExternalUrl(url)) {
          return err(platformInvalidUrl('Only http and https URLs can be opened.'));
        }
        try {
          if (env.windowOpen) {
            env.windowOpen(url);
          } else if (env.locationAssign) {
            env.locationAssign(url);
          } else {
            return err(platformUnsupported('Cannot open external links in this environment.'));
          }
          return ok(undefined);
        } catch {
          return err(platformUnsupported('Could not open external link.'));
        }
      },
    },

    installPrompt: {
      getState: async (): Promise<AppResult<PlatformInstallPromptState>> => {
        if (!env.getInstallPromptAvailable && !env.subscribeBeforeInstallPrompt) {
          return ok({ kind: 'unsupported' });
        }
        if (env.getInstallPromptAvailable?.()) {
          return ok({ kind: 'available' });
        }
        if (installPromptHandler) {
          return ok({ kind: 'available' });
        }
        return ok({ kind: 'unsupported' });
      },
      prompt: async () => {
        if (!installPromptHandler?.prompt) {
          return err(platformUnsupported('Install prompt is not available.'));
        }
        try {
          await installPromptHandler.prompt();
          return ok(undefined);
        } catch {
          return err(platformUnsupported('Install prompt failed.'));
        }
      },
    },

    secureStorage: {
      get: async () => err(platformUnsupported('Secure storage is not available on web.')),
      set: async () => err(platformUnsupported('Secure storage is not available on web.')),
      delete: async () => err(platformUnsupported('Secure storage is not available on web.')),
    },

    diagnostics: {
      getSnapshot: async () => {
        const snapshot: PlatformDiagnosticsSnapshot = {};
        if (typeof globalThis.navigator !== 'undefined' && globalThis.navigator.userAgent) {
          return ok({ ...snapshot, platform: globalThis.navigator.userAgent });
        }
        return ok(snapshot);
      },
    },

    localService: {
      getInfo: async () =>
        ok({
          running: false,
          host: null,
          port: null,
        }),
    },

    storage: {
      getItem: async (key: string) => {
        if (!env.localStorage) {
          return err(platformUnsupported('Browser storage is not available.'));
        }
        return ok(env.localStorage.getItem(key) ?? undefined);
      },
      setItem: async (key: string, value: string) => {
        if (!env.localStorage) {
          return err(platformUnsupported('Browser storage is not available.'));
        }
        env.localStorage.setItem(key, value);
        return ok(undefined);
      },
      deleteItem: async (key: string) => {
        if (!env.localStorage) {
          return err(platformUnsupported('Browser storage is not available.'));
        }
        env.localStorage.removeItem(key);
        return ok(undefined);
      },
      estimate: async (): Promise<AppResult<PlatformStorageEstimate>> => {
        if (!env.storageManager?.estimate) {
          return err(platformUnsupported('Storage estimate is not available.'));
        }
        const estimate = await env.storageManager.estimate();
        const persisted = env.storageManager.persisted
          ? await env.storageManager.persisted()
          : undefined;

        const quotaOpt = estimate.quota !== undefined ? { quota: estimate.quota } : {};
        const usageOpt = estimate.usage !== undefined ? { usage: estimate.usage } : {};
        const persistedOpt = persisted !== undefined ? { persisted } : {};

        return ok({ ...quotaOpt, ...usageOpt, ...persistedOpt });
      },
      persist: async () => {
        if (!env.storageManager?.persist) {
          return err(platformUnsupported('Persistent storage is not available.'));
        }
        return ok(await env.storageManager.persist());
      },
    },

    blobStorage: {
      put: async (key: string, data: ArrayBuffer, mimeType: string) => {
        if (!env.indexedDB) {
          return err(platformUnsupported('Blob storage is not available in this environment.'));
        }
        try {
          await putIndexedDbBlob(key, data, mimeType, { indexedDB: env.indexedDB });
          return ok(undefined);
        } catch {
          return err(platformUnsupported('Could not store blob.'));
        }
      },
      get: async (key: string) => {
        if (!env.indexedDB) {
          return err(platformUnsupported('Blob storage is not available in this environment.'));
        }
        try {
          const record = await getIndexedDbBlob(key, { indexedDB: env.indexedDB });
          return ok(record);
        } catch {
          return err(platformUnsupported('Could not read blob.'));
        }
      },
      delete: async (key: string) => {
        if (!env.indexedDB) {
          return err(platformUnsupported('Blob storage is not available in this environment.'));
        }
        try {
          await deleteIndexedDbBlob(key, { indexedDB: env.indexedDB });
          return ok(undefined);
        } catch {
          return err(platformUnsupported('Could not delete blob.'));
        }
      },
      createObjectUrl: async (data: ArrayBuffer, mimeType: string) => {
        if (!env.createObjectUrl) {
          return err(platformUnsupported('Object URLs are not available in this environment.'));
        }
        try {
          const blob = new Blob([data], { type: mimeType });
          return ok(env.createObjectUrl(blob));
        } catch {
          return err(platformUnsupported('Could not create object URL.'));
        }
      },
      revokeObjectUrl: async (url: string) => {
        if (!env.revokeObjectUrl) {
          return err(platformUnsupported('Object URLs are not available in this environment.'));
        }
        try {
          env.revokeObjectUrl(url);
          return ok(undefined);
        } catch {
          return err(platformUnsupported('Could not revoke object URL.'));
        }
      },
    },
  };
}
