// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';
import { useReaderViewport } from './use-reader-viewport.js';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as Record<string, unknown>)['ResizeObserver'] ??= ResizeObserverStub;

function Probe() {
  const { containerRef, viewport } = useReaderViewport();
  return (
    <div
      ref={containerRef}
      data-testid="probe"
      data-width={viewport.width}
      data-height={viewport.height}
    />
  );
}

describe('useReaderViewport', () => {
  it('Given a measurable surface, When it mounts, Then the first paint already carries the measured viewport', () => {
    const widthSpy = vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1200);
    const heightSpy = vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(800);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      act(() => {
        flushSync(() => {
          root.render(<Probe />);
        });
        // Still before passive effects: whatever the box says here is what the
        // first paint shows.
        const probe = container.querySelector<HTMLElement>('[data-testid="probe"]');
        expect(probe?.dataset['width']).toBe('1200');
        expect(probe?.dataset['height']).toBe('800');
      });
    } finally {
      act(() => root.unmount());
      container.remove();
      widthSpy.mockRestore();
      heightSpy.mockRestore();
    }
  });

  it('Given an unmeasurable surface, When it mounts, Then the default viewport is kept', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      act(() => {
        flushSync(() => {
          root.render(<Probe />);
        });
        const probe = container.querySelector<HTMLElement>('[data-testid="probe"]');
        expect(probe?.dataset['width']).toBe('800');
        expect(probe?.dataset['height']).toBe('600');
      });
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
