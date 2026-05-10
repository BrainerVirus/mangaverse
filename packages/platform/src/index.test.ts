import { describe, expect, it } from 'vitest';
import {
  PACKAGE_NAME,
  createElectronPlatformAdapter,
  createWebPlatformAdapter,
  createUnsupportedPlatformAdapter,
  detectElectronCapabilities,
  detectWebCapabilities,
  isExtensionInstallProtocolUrl,
  isSafeExternalUrl,
  parseMangaverseInstallExtensionProviderUrl,
} from './index.js';
import { platformUnsupported } from './errors.js';

describe('@app/platform public exports', () => {
  it('exports platform adapter factories and package name', () => {
    expect(PACKAGE_NAME).toBe('@app/platform');
    expect(typeof createWebPlatformAdapter).toBe('function');
    expect(typeof createUnsupportedPlatformAdapter).toBe('function');
    expect(typeof detectWebCapabilities).toBe('function');
    expect(typeof detectElectronCapabilities).toBe('function');
    expect(typeof isSafeExternalUrl).toBe('function');
    expect(typeof isExtensionInstallProtocolUrl).toBe('function');
    expect(typeof parseMangaverseInstallExtensionProviderUrl).toBe('function');
  });

  it('does not require browser or Electron globals at import time', () => {
    expect(typeof globalThis.window).toBe('undefined');
    const caps = detectWebCapabilities({
      hasClipboardRead: false,
      hasClipboardWrite: false,
      fullscreenEnabled: false,
      hasRegisterProtocolHandler: false,
      installPromptObservable: false,
      isSecureContext: false,
    });
    expect(caps.runtime).toBe('web');
  });

  it('creates unsupported errors without leaking causes in details', () => {
    const inner = new Error('secret');
    const e = platformUnsupported('nope', inner);
    expect(e.details).toBeUndefined();
    expect(e.message).toBe('nope');
  });

  it('validates mangaverse install URLs', () => {
    const good = parseMangaverseInstallExtensionProviderUrl(
      'mangaverse://install-extension?url=' + encodeURIComponent('https://cdn.example.com/ext.json'),
    );
    expect(good.ok && good.value).toBe('https://cdn.example.com/ext.json');
    expect(isExtensionInstallProtocolUrl('mangaverse://install-extension?url=https%3A%2F%2Fx')).toBe(true);
  });
});
