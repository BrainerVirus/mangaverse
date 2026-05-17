import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PlatformProvider, usePlatform } from './platform-provider';
import type { PlatformCapabilities } from '@app/platform';

const mockCapabilities: PlatformCapabilities = {
  runtime: 'web',
  clipboardRead: true,
  clipboardWrite: true,
  nativeFileOpen: false,
  nativeFileSave: true,
  nativeFullscreen: true,
  externalLinks: true,
  protocolInstallHandoff: false,
  installPrompt: false,
  secureStorage: false,
  persistentStorage: true,
  storageEstimate: true,
  diagnostics: true,
  localService: false,
  sqliteRuntime: false,
};

function MockChild() {
  const platform = usePlatform();
  return (
    <div data-runtime={platform.runtime} data-clipboard-read={String(platform.capabilities.clipboardRead)}>
      {platform.runtime}
    </div>
  );
}

describe('PlatformProvider', () => {
  it('throws when usePlatform is used outside Provider', () => {
    expect(() => {
      renderToString(<MockChild />);
    }).toThrow('usePlatform must be used within PlatformProvider');
  });

  it('provides capabilities and runtime to children', () => {
    const html = renderToString(
      <PlatformProvider detectFn={() => mockCapabilities}>
        <MockChild />
      </PlatformProvider>
    );
    expect(html).toContain('web');
    expect(html).toContain('true');
  });
});