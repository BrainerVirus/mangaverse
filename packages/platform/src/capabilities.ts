import type { ElectronCapabilityInput, PlatformCapabilities, WebCapabilityEnvironment } from './types.js';

function probeBrowserEnvironment(): WebCapabilityEnvironment {
  const nav = globalThis.navigator as Navigator | undefined;
  const doc = globalThis.document as Document | undefined;

  return {
    hasClipboardRead: Boolean(nav?.clipboard?.readText),
    hasClipboardWrite: Boolean(nav?.clipboard?.writeText),
    fullscreenEnabled: Boolean(doc?.fullscreenEnabled),
    hasRegisterProtocolHandler: Boolean(nav && 'registerProtocolHandler' in nav),
    installPromptObservable: typeof globalThis.window !== 'undefined',
    isSecureContext: Boolean(globalThis.isSecureContext),
    hasLocalStorage: typeof globalThis.localStorage !== 'undefined',
    hasStorageEstimate: Boolean(nav && 'storage' in nav && nav.storage?.estimate),
    hasStoragePersist: Boolean(nav && 'storage' in nav && nav.storage?.persist),
    hasDownload:
      typeof globalThis.Blob !== 'undefined' &&
      typeof globalThis.URL?.createObjectURL === 'function' &&
      typeof globalThis.document !== 'undefined',
  };
}

export function detectWebCapabilities(environment?: WebCapabilityEnvironment): PlatformCapabilities {
  const probe = environment ?? probeBrowserEnvironment();

  const runtime: PlatformCapabilities['runtime'] =
    environment !== undefined
      ? 'web'
      : typeof globalThis.window !== 'undefined'
        ? 'web'
        : 'unknown';

  const clipboardRead = Boolean(probe.hasClipboardRead);
  const clipboardWrite = Boolean(probe.hasClipboardWrite);
  const nativeFullscreen = Boolean(probe.fullscreenEnabled);
  const protocolInstallHandoff = Boolean(probe.hasRegisterProtocolHandler);
  const installPrompt = Boolean(probe.installPromptObservable && probe.isSecureContext);
  const nativeFileSave = Boolean(probe.hasDownload);
  const persistentStorage = Boolean(probe.hasStoragePersist && probe.isSecureContext);
  const storageEstimate = Boolean(probe.hasStorageEstimate && probe.isSecureContext);

  return {
    runtime,
    clipboardRead,
    clipboardWrite,
    nativeFileOpen: false,
    nativeFileSave,
    nativeFullscreen,
    externalLinks: typeof globalThis.window !== 'undefined',
    protocolInstallHandoff,
    installPrompt,
    secureStorage: false,
    persistentStorage,
    storageEstimate,
    diagnostics: typeof globalThis.window !== 'undefined',
    localService: false,
    sqliteRuntime: false,
  };
}

export function detectElectronCapabilities(input?: ElectronCapabilityInput): PlatformCapabilities {
  const base: PlatformCapabilities = {
    runtime: 'electron',
    clipboardRead: true,
    clipboardWrite: true,
    nativeFileOpen: true,
    nativeFileSave: true,
    nativeFullscreen: true,
    externalLinks: true,
    protocolInstallHandoff: true,
    installPrompt: false,
    secureStorage: true,
    persistentStorage: false,
    storageEstimate: false,
    diagnostics: true,
    localService: true,
    sqliteRuntime: true,
  };

  if (!input) {
    return base;
  }

  return {
    ...base,
    ...input,
    runtime: input.runtime ?? 'electron',
  };
}

export function createUnknownCapabilities(_reason: string): PlatformCapabilities {
  return {
    runtime: 'unknown',
    clipboardRead: false,
    clipboardWrite: false,
    nativeFileOpen: false,
    nativeFileSave: false,
    nativeFullscreen: false,
    externalLinks: false,
    protocolInstallHandoff: false,
    installPrompt: false,
    secureStorage: false,
    persistentStorage: false,
    storageEstimate: false,
    diagnostics: false,
    localService: false,
    sqliteRuntime: false,
  };
}
