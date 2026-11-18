// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { CachedPageImage } from './CachedPageImage.js';

const mocks = vi.hoisted(() => ({
  resolve:
    vi.fn<
      (
        ...args: unknown[]
      ) => Promise<{ objectUrl: string; fromCache?: boolean; byteSize?: number } | undefined>
    >(),
  context: { db: {}, adapter: { blobStorage: { revokeObjectUrl: vi.fn<() => void>() } } },
}));
vi.mock('../page-cache-store.js', () => ({ resolvePageObjectUrl: mocks.resolve }));
vi.mock('./CoverCacheProvider.js', () => ({ useCoverCacheContext: () => mocks.context }));

describe('CachedPageImage recovery', () => {
  it('applies the requested image rendering and reports one load metric', async () => {
    mocks.resolve.mockResolvedValue({
      objectUrl: 'blob:pixel',
      fromCache: true,
      byteSize: 2048,
    });
    const onMetric = vi.fn<(metric: unknown) => void>();
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <CachedPageImage
          providerId="p"
          mangaId="m"
          chapterId="c"
          pageIndex={3}
          remoteUrl="https://example.com/3.png"
          imageRendering="pixelated"
          onMetric={onMetric}
        />,
      ),
    );
    const image = container.querySelector('img');
    expect(image?.className).toContain('image-pixelated');
    await act(async () => image?.dispatchEvent(new Event('load')));
    expect(onMetric).toHaveBeenCalledTimes(1);
    expect(onMetric).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'loaded', fromCache: true, byteSize: 2048 }),
    );
    act(() => root.unmount());
  });

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

  it('Given an overlay, When the source arrives, Then the same overlay node stays and learns the page is ready', async () => {
    let release: (value: { objectUrl: string }) => void = () => {};
    mocks.resolve.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <CachedPageImage
          providerId="p"
          mangaId="m"
          chapterId="c"
          pageIndex={4}
          remoteUrl="https://example.com/4.png"
          renderPlaceholder={(ready) => <span data-overlay={String(ready)} />}
        />,
      ),
    );
    const overlay = container.querySelector('[data-overlay]');
    expect(overlay?.getAttribute('data-overlay')).toBe('false');
    expect(container.querySelector('img')).toBeNull();

    await act(async () => release({ objectUrl: 'blob:page' }));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:page');
    // Not remounted: an animation on it carries on into the dissolve.
    expect(container.querySelector('[data-overlay]')).toBe(overlay);
    expect(overlay?.getAttribute('data-overlay')).toBe('true');
    act(() => root.unmount());
  });

  it('Given an overlay, When the page fails, Then the overlay is dropped so the Retry controls stay clear', async () => {
    mocks.resolve.mockResolvedValue(undefined);
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <CachedPageImage
          providerId="p"
          mangaId="m"
          chapterId="c"
          pageIndex={5}
          remoteUrl="https://example.com/5.png"
          renderPlaceholder={(ready) => <span data-overlay={String(ready)} />}
        />,
      ),
    );
    expect(container.textContent).toContain('Could not load page 6');
    expect(container.querySelector('[data-overlay]')).toBeNull();
    act(() => root.unmount());
  });
});
