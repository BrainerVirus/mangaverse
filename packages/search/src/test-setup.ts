import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

class ResizeObserverMock {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe = (target: Element) => {
    const element = target as HTMLElement;
    const width =
      element.clientWidth ||
      element.parentElement?.clientWidth ||
      element.getBoundingClientRect().width ||
      1200;

    Object.defineProperty(element, 'clientWidth', {
      configurable: true,
      value: width,
    });

    this.callback(
      [
        {
          target,
          contentRect: {
            width,
            height: 0,
          } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ],
      this,
    );
  };

  unobserve = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

afterEach(() => {
  cleanup();
});
