// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { CachedCoverImage } from './CachedCoverImage.js';

const mocks = vi.hoisted(() => ({
  resolve:
    vi.fn<(...args: unknown[]) => Promise<{ objectUrl: string; fromCache: boolean } | undefined>>(),
  context: {
    db: {},
    adapter: { blobStorage: { revokeObjectUrl: vi.fn<() => Promise<unknown>>() } },
    cacheLimitBytes: 1024,
  },
}));

vi.mock('../cover-cache-store.js', () => ({ resolveCoverObjectUrl: mocks.resolve }));
vi.mock('../cache-maintenance.js', () => ({ requestCacheMaintenance: vi.fn<() => void>() }));
vi.mock('./CoverCacheProvider.js', () => ({ useCoverCacheContext: () => mocks.context }));

describe('CachedCoverImage', () => {
  it('renders the new blob when the cover URL changes', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    mocks.resolve.mockResolvedValueOnce({ objectUrl: 'blob:provider', fromCache: true });
    await act(async () =>
      root.render(
        <CachedCoverImage
          providerId="p"
          mangaId="m"
          remoteUrl="https://uploads.mangadex.org/covers/provider.jpg"
          alt="Manga"
        />,
      ),
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:provider');

    mocks.resolve.mockResolvedValueOnce({ objectUrl: 'blob:custom', fromCache: false });
    await act(async () =>
      root.render(
        <CachedCoverImage
          providerId="p"
          mangaId="m"
          remoteUrl="https://example.com/custom.jpg"
          alt="Manga"
        />,
      ),
    );

    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe('blob:custom');
    expect(image?.getAttribute('data-cover-url')).toBe('https://example.com/custom.jpg');
    expect(mocks.resolve).toHaveBeenLastCalledWith(
      expect.objectContaining({ remoteUrl: 'https://example.com/custom.jpg' }),
    );

    act(() => root.unmount());
  });
});
