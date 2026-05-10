import { describe, expect, it } from 'vitest';
import {
  createUnknownCapabilities,
  detectElectronCapabilities,
  detectWebCapabilities,
} from './capabilities.js';

describe('detectWebCapabilities', () => {
  it('reports supported capabilities when browser APIs are present', () => {
    const caps = detectWebCapabilities({
      hasClipboardRead: true,
      hasClipboardWrite: true,
      fullscreenEnabled: true,
      hasRegisterProtocolHandler: true,
      installPromptObservable: true,
      isSecureContext: true,
    });
    expect(caps.runtime).toBe('web');
    expect(caps.clipboardRead).toBe(true);
    expect(caps.clipboardWrite).toBe(true);
    expect(caps.nativeFullscreen).toBe(true);
    expect(caps.protocolInstallHandoff).toBe(true);
    expect(caps.installPrompt).toBe(true);
    expect(caps.nativeFileOpen).toBe(false);
    expect(caps.secureStorage).toBe(false);
    expect(caps.localService).toBe(false);
    expect(caps.sqliteRuntime).toBe(false);
  });

  it('reports unsupported capabilities when browser APIs are missing', () => {
    const caps = detectWebCapabilities({
      hasClipboardRead: false,
      hasClipboardWrite: false,
      fullscreenEnabled: false,
      hasRegisterProtocolHandler: false,
      installPromptObservable: false,
      isSecureContext: false,
    });
    expect(caps.runtime).toBe('web');
    expect(caps.clipboardRead).toBe(false);
    expect(caps.clipboardWrite).toBe(false);
    expect(caps.nativeFullscreen).toBe(false);
    expect(caps.protocolInstallHandoff).toBe(false);
    expect(caps.installPrompt).toBe(false);
  });

  it('does not report web file save support without download capability', () => {
    const caps = detectWebCapabilities({
      hasClipboardRead: false,
      hasClipboardWrite: false,
      fullscreenEnabled: false,
      hasRegisterProtocolHandler: false,
      installPromptObservable: false,
      isSecureContext: true,
      hasDownload: false,
    });
    expect(caps.nativeFileSave).toBe(false);
  });

  it('reports browser storage capabilities', () => {
    const caps = detectWebCapabilities({
      hasLocalStorage: true,
      hasStorageEstimate: true,
      hasStoragePersist: true,
      isSecureContext: true,
    });
    expect(caps.persistentStorage).toBe(true);
    expect(caps.storageEstimate).toBe(true);
  });

  it('does not report storage capabilities when unavailable', () => {
    const caps = detectWebCapabilities({
      hasLocalStorage: false,
      hasStorageEstimate: false,
      hasStoragePersist: false,
      isSecureContext: false,
    });
    expect(caps.persistentStorage).toBe(false);
    expect(caps.storageEstimate).toBe(false);
  });

  it('reports persistent storage only when storage persist is available in a secure context', () => {
    const localOnly = detectWebCapabilities({
      hasLocalStorage: true,
      hasStoragePersist: false,
      isSecureContext: true,
    });
    expect(localOnly.persistentStorage).toBe(false);

    const persistSupported = detectWebCapabilities({
      hasLocalStorage: true,
      hasStoragePersist: true,
      isSecureContext: true,
    });
    expect(persistSupported.persistentStorage).toBe(true);
  });

  it('reports file save only when download support is present', () => {
    expect(detectWebCapabilities({ hasDownload: false }).nativeFileSave).toBe(false);
    expect(detectWebCapabilities({ hasDownload: true }).nativeFileSave).toBe(true);
  });
});

describe('detectElectronCapabilities', () => {
  it('preserves native desktop capabilities', () => {
    const caps = detectElectronCapabilities({
      secureStorage: true,
      protocolInstallHandoff: true,
      localService: true,
    });
    expect(caps.runtime).toBe('electron');
    expect(caps.nativeFileOpen).toBe(true);
    expect(caps.nativeFileSave).toBe(true);
    expect(caps.nativeFullscreen).toBe(true);
    expect(caps.externalLinks).toBe(true);
    expect(caps.diagnostics).toBe(true);
    expect(caps.sqliteRuntime).toBe(true);
    expect(caps.secureStorage).toBe(true);
    expect(caps.protocolInstallHandoff).toBe(true);
    expect(caps.localService).toBe(true);
  });
});

describe('createUnknownCapabilities', () => {
  it('does not throw for unknown runtime', () => {
    const caps = createUnknownCapabilities('unit test');
    expect(caps.runtime).toBe('unknown');
    expect(caps.clipboardRead).toBe(false);
    expect(caps.diagnostics).toBe(false);
  });
});
