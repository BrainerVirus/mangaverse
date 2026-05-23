import { describe, it, expect } from 'vitest';
import { detectElectronCapabilities } from '@app/platform';

describe('desktop renderer shell', () => {
  it('exports App and bootstrap for web router integration', async () => {
    const { App } = await import('./App.js');
    const { detectDesktopCapabilities } = await import('./bootstrap.js');

    expect(typeof App).toBe('function');
    expect(typeof detectDesktopCapabilities).toBe('function');
  });

  it('detects electron platform capabilities for ShellProviders', async () => {
    const { detectDesktopCapabilities } = await import('./bootstrap.js');
    const caps = detectDesktopCapabilities();

    expect(caps.runtime).toBe('electron');
    expect(caps).toEqual(detectElectronCapabilities());
  });

  it('creates a router with desktop platform detection context', async () => {
    const { getRouter } = await import('@app/web/app/router.js');
    const { detectDesktopCapabilities } = await import('./bootstrap.js');

    const router = getRouter({ platformDetectFn: detectDesktopCapabilities });
    expect(router.options.defaultPreload).toBe('intent');
    expect(
      (router.options.context as { platformDetectFn?: () => unknown }).platformDetectFn,
    ).toBe(detectDesktopCapabilities);
  });
});
