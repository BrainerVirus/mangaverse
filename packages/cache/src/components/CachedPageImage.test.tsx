// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { CachedPageImage } from './CachedPageImage.js';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn<(...args: unknown[]) => Promise<{ objectUrl: string } | undefined>>(),
  context: { db: {}, adapter: { blobStorage: { revokeObjectUrl: vi.fn<() => void>() } } },
}));
vi.mock('../page-cache-store.js', () => ({ resolvePageObjectUrl: mocks.resolve }));
vi.mock('./CoverCacheProvider.js', () => ({ useCoverCacheContext: () => mocks.context }));

describe('CachedPageImage recovery', () => {
  it('shows a failed page and retries the mounted image', async () => {
    mocks.resolve
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue({ objectUrl: 'blob:recovered' });
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <CachedPageImage
          providerId="p"
          mangaId="m"
          chapterId="c"
          pageIndex={0}
          remoteUrl="https://example.com/1.png"
        />,
      ),
    );
    expect(container.textContent).toContain('Could not load page 1');
    const retry = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Retry',
    );
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:recovered');
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });
});
