import { err, ok, type AppResult } from '@app/shared';
import { createUnknownCapabilities } from './capabilities.js';
import { platformUnsupported } from './errors.js';
import type {
  PlatformAdapter,
  PlatformBlobRecord,
  PlatformDiagnosticsSnapshot,
  PlatformFileOpenOptions,
  PlatformFileSaveOptions,
  PlatformFileResult,
  PlatformInstallPromptState,
  PlatformStorageEstimate,
} from './types.js';

export function createUnsupportedPlatformAdapter(reason: string): PlatformAdapter {
  const deny = <T,>(): AppResult<T> => err(platformUnsupported(reason));
  const caps = createUnknownCapabilities(reason);

  return {
    capabilities: async () => ok(caps),
    clipboard: {
      readText: async () => deny<string>(),
      writeText: async () => deny<void>(),
    },
    files: {
      openTextFile: async (_options: PlatformFileOpenOptions) => deny<PlatformFileResult>(),
      saveTextFile: async (_options: PlatformFileSaveOptions) => deny<PlatformFileResult>(),
    },
    fullscreen: {
      enter: async () => deny<void>(),
      exit: async () => deny<void>(),
      isActive: async () => deny<boolean>(),
    },
    protocol: {
      getPendingInstallUrl: async () => ok<string | null>(null),
      canHandleInstallLinks: async () => ok(false),
    },
    externalLinks: {
      open: async () => deny<void>(),
    },
    installPrompt: {
      getState: async (): Promise<AppResult<PlatformInstallPromptState>> => ok({ kind: 'unsupported' }),
      prompt: async () => deny<void>(),
    },
    secureStorage: {
      get: async () => deny<string | undefined>(),
      set: async () => deny<void>(),
      delete: async () => deny<void>(),
    },
    diagnostics: {
      getSnapshot: async () => deny<PlatformDiagnosticsSnapshot>(),
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
      getItem: async () => deny<string | undefined>(),
      setItem: async () => deny<void>(),
      deleteItem: async () => deny<void>(),
      estimate: async () => deny<PlatformStorageEstimate>(),
      persist: async () => deny<boolean>(),
    },
    blobStorage: {
      put: async () => deny<void>(),
      get: async () => deny<PlatformBlobRecord | undefined>(),
      delete: async () => deny<void>(),
      createObjectUrl: async () => deny<string>(),
      revokeObjectUrl: async () => deny<void>(),
    },
    network: {
      fetchBytes: async () => deny<undefined>(),
    },
  };
}
