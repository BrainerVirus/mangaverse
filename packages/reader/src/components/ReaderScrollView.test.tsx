// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useState } from 'react';
import { toChapterPageId } from '@app/shared';
import type { ReaderPage } from '../types.js';
import { ReaderScrollView, type ReaderScrollViewHandle } from './ReaderScrollView.js';

vi.mock('@app/cache', () => ({ CachedPageImage: () => null }));

const VIEWPORT_HEIGHT = 100;

interface ObserverRecord {
  readonly callback: ResizeObserverCallback;
}

/** jsdom has no layout, so the test fires the observer the component registers. */
const observers: ObserverRecord[] = [];

class ResizeObserverStub {
  private readonly record: ObserverRecord;
  constructor(callback: ResizeObserverCallback) {
    this.record = { callback };
    observers.push(this.record);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

function fireResize() {
  const record = observers.at(-1);
  if (record === undefined) throw new Error('the strip registered no ResizeObserver');
  act(() => {
    record.callback([], {} as ResizeObserver);
  });
}

function buildPages(count: number): readonly ReaderPage[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: toChapterPageId(`page-${index}`),
    index,
    image: { url: `https://example.com/${index}.jpg` },
  }));
}

function Harness({
  pages,
  onActivePageChange,
  handleRef,
}: {
  readonly pages: readonly ReaderPage[];
  readonly onActivePageChange: (index: number) => void;
  readonly handleRef: { current: ReaderScrollViewHandle | null };
}) {
  const [active, setActive] = useState(0);
  return (
    <ReaderScrollView
      pages={pages}
      gapPx={0}
      activePageIndex={active}
      onActivePageChange={(index) => {
        setActive(index);
        onActivePageChange(index);
      }}
      providerId="mangadex"
      mangaId="manga-1"
      chapterId="chapter-1"
      cacheReady={false}
      reducedMotion
      onHandle={(handle) => {
        handleRef.current = handle;
      }}
    />
  );
}

interface Mounted {
  readonly root: Root;
  readonly container: HTMLElement;
  readonly strip: HTMLElement;
  readonly handleRef: { current: ReaderScrollViewHandle | null };
  readonly activeChanges: number[];
}

function mount(pageCount: number): Mounted {
  observers.length = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const handleRef = { current: null };
  const activeChanges: number[] = [];
  act(() => {
    root.render(
      <Harness
        pages={buildPages(pageCount)}
        handleRef={handleRef}
        onActivePageChange={(index) => activeChanges.push(index)}
      />,
    );
  });

  const strip = container.querySelector<HTMLElement>('[data-testid="reader-scroll-view"]');
  if (strip === null) throw new Error('scroll view did not render');
  Object.defineProperty(strip, 'clientHeight', { configurable: true, value: VIEWPORT_HEIGHT });

  return { root, container, strip, handleRef, activeChanges };
}

function unmount({ root, container }: Mounted) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

/** Page N starts at N * stride and is `height` tall. */
function stubStrip(container: HTMLElement, stride: number, height: number) {
  for (const node of container.querySelectorAll<HTMLElement>('[data-page-index]')) {
    const index = Number(node.dataset['pageIndex']);
    Object.defineProperty(node, 'offsetTop', { configurable: true, value: index * stride });
    Object.defineProperty(node, 'offsetHeight', { configurable: true, value: height });
  }
}

async function scrollTo(strip: HTMLElement, scrollTop: number) {
  act(() => {
    strip.scrollTop = scrollTop;
    strip.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  // The scroll handler reads offsets in a requestAnimationFrame.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

describe('ReaderScrollView metrics', () => {
  it('Given the strip resized, When scrolling, Then the active page comes from the new offsets', async () => {
    const mounted = mount(8);
    // 8 pages of 100px: tops 0, 100, …, 700.
    stubStrip(mounted.container, 100, 100);
    fireResize();

    // A 100px viewport at scrollTop 250 centres on 300, inside page 3.
    await scrollTo(mounted.strip, 250);
    expect(mounted.activeChanges.at(-1)).toBe(3);

    // The strip grows tenfold, so the same scrollTop now sits inside page 0.
    // A stale cache would keep resolving 3 and never call back.
    stubStrip(mounted.container, 1000, 1000);
    fireResize();
    await scrollTo(mounted.strip, 250);

    expect(mounted.activeChanges.at(-1)).toBe(0);
    unmount(mounted);
  });

  it('Given DOM order disagrees with offsets, When measured, Then metrics stay sorted by top', () => {
    const mounted = mount(3);
    stubStrip(mounted.container, 100, 100);

    const [first] = mounted.container.querySelectorAll<HTMLElement>('[data-page-index]');
    if (first?.parentElement === null || first?.parentElement === undefined) {
      throw new Error('page row has no strip parent');
    }
    // Move the first row last: document order (1, 2, 0) no longer matches the
    // measured tops, which the binary search requires to increase.
    first.parentElement.append(first);

    const handle = mounted.handleRef.current;
    if (handle === null) throw new Error('scroll view published no handle');
    expect(handle.measurePages().map((metric) => metric.top)).toEqual([0, 100, 200]);
    unmount(mounted);
  });
});
