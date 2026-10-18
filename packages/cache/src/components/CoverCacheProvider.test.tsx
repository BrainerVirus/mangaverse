// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useEffect } from 'react';
import { CoverCacheProvider, useCoverCacheContext } from './CoverCacheProvider.js';
import type * as coverCacheStore from '../cover-cache-store.js';

vi.mock('../cover-cache-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof coverCacheStore>()),
  runCoverCacheMaintenance: vi.fn<() => Promise<void>>(async () => {}),
}));

let mountCount = 0;

function Probe() {
  const context = useCoverCacheContext();
  useEffect(() => {
    mountCount += 1;
  }, []);
  return <div data-testid="probe">{context === null ? 'not-ready' : 'ready'}</div>;
}

describe('CoverCacheProvider tree stability', () => {
  it('Given children mounted without a database, When the database arrives, Then children are not remounted', async () => {
    mountCount = 0;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    const adapter = { blobStorage: {}, storageEstimate: async () => ({ usage: 0, quota: 0 }) };

    const render = async (db: unknown) => {
      await act(async () => {
        root.render(
          <CoverCacheProvider db={db as never} adapter={adapter as never} cacheLimitBytes={1024}>
            <Probe />
          </CoverCacheProvider>,
        );
      });
    };

    await render(null);
    expect(container.textContent).toBe('not-ready');
    expect(mountCount).toBe(1);

    await render({ id: 'db' });
    expect(container.textContent).toBe('ready');
    // The probe must survive the readiness flip: still one mount, not two.
    expect(mountCount).toBe(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
