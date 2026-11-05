// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useState, type ReactNode } from 'react';
import {
  getDefaultReaderSettings,
  toChapterPageId,
  type ReaderSettings,
  type ReaderSettingsOverride,
} from '@app/shared';

vi.mock('@app/cache', () => ({
  createPageDecodePool: () => ({
    setPlan: () => {},
    snapshot: () => ({ decoded: 0, pending: 0, released: 0, failures: 0 }),
    dispose: () => {},
  }),
  CachedPageImage: () => null,
  holdReaderLocks: vi.fn<(chapter: unknown) => () => void>(() => () => {}),
  evictCacheToLimit: vi.fn<() => Promise<{ evictedCount: number }>>(async () => ({
    evictedCount: 0,
  })),
  listCachedChapterPageIndexes: vi.fn<() => Promise<number[]>>(async () => []),
  markChapterPagesAsRead: vi.fn<() => Promise<void>>(async () => {}),
  prefetchChapterPages: vi.fn<() => Promise<unknown>>(async () => ({})),
  useCoverCacheContext: () => null,
}));

vi.mock('@app/design-system/motion', () => ({
  useReducedMotion: () => true,
  useGsapContext: () => {},
  readerPageEnter: vi.fn<() => void>(),
}));

vi.mock('@app/design-system', async () => {
  const { useReducer } = await import('react');
  return {
    Button: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
      <button {...(props as object)}>{children}</button>
    ),
    Dialog: ({ children }: { children: ReactNode }) => <dialog open>{children}</dialog>,
    DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    EmptyState: () => null,
    ErrorState: () => null,
    GlassSurface: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    LoadingState: () => null,
    // The chrome's mode switch, reduced to the calls the reader makes.
    ReaderChrome: (props: {
      mode?: string;
      onModeChange?: (mode: string) => void;
      onOpenSettings?: () => void;
    }) => (
      <div data-testid="chrome" data-mode={props.mode}>
        <button onClick={() => props.onModeChange?.('single')}>Chrome single</button>
        <button onClick={() => props.onModeChange?.('double')}>Chrome double</button>
        <button onClick={() => props.onModeChange?.('scroll')}>Chrome scroll</button>
        <button onClick={props.onOpenSettings}>Settings</button>
      </div>
    ),
    Sheet: ({
      children,
      open,
      onOpenChange,
    }: {
      children: ReactNode;
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }) =>
      open ? (
        <dialog open>
          <button onClick={() => onOpenChange(false)}>Close sheet</button>
          {children}
        </dialog>
      ) : null,
    SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    Input: (props: Record<string, unknown>) => <input {...(props as object)} />,
    Slider: (props: Record<string, unknown>) => <input type="range" {...(props as object)} />,
    useStateReducer: (reducer: (state: unknown, event: unknown) => unknown, initial: unknown) =>
      useReducer(reducer as never, initial),
  };
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= ResizeObserverStub;

if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

import { ReaderScreen } from './ReaderScreen.js';
import { applyReaderSettingsChange } from '../reader-settings-change.js';
import { toReaderEngineSettings } from '../to-reader-engine-settings.js';
import type { ReaderPageData } from '../reader-page-data.js';
import type { ReaderSettingsScope } from '../types.js';

type Change = { readonly patch: Partial<ReaderSettings>; readonly scope: ReaderSettingsScope };

function buildData(
  global: Partial<ReaderSettings>,
  titleOverrides: ReaderSettingsOverride = {},
): ReaderPageData {
  const globalSettings = { ...getDefaultReaderSettings(), ...global };
  const settings = { ...globalSettings, ...titleOverrides };
  const pages = Array.from({ length: 5 }, (_value, index) => ({
    id: toChapterPageId(`page-${index}`),
    index,
    image: { url: `https://example.com/${index}.jpg` },
  }));
  return {
    chapter: { id: 'chapter-1', mangaId: 'manga-1', title: 'Chapter 1', pages, pageCount: 5 },
    mangaId: 'manga-1' as ReaderPageData['mangaId'],
    chapterId: 'chapter-1' as ReaderPageData['chapterId'],
    providerId: 'mangadex',
    initialPageIndex: 0,
    settings,
    globalSettings,
    titleOverrides,
    engineSettings: toReaderEngineSettings(settings, { titleOverrides }),
  };
}

/** Plays the route's part: every change lands in the data the reader renders next. */
function Harness({ initial, changes }: { initial: ReaderPageData; changes: Change[] }) {
  const [data, setData] = useState(initial);
  return (
    <ReaderScreen
      data={data}
      isLoading={false}
      isError={false}
      chromeVisible
      onToggleChrome={() => {}}
      onChangeSettings={(patch, scope) => {
        changes.push({ patch, scope });
        setData((current) => applyReaderSettingsChange(current, patch, scope));
      }}
    />
  );
}

function renderReader(initial: ReaderPageData): {
  root: Root;
  container: HTMLElement;
  changes: Change[];
} {
  const changes: Change[] = [];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Harness initial={initial} changes={changes} />));
  return { root, container, changes };
}

/** A labelled choice group: a fieldset named by its legend. */
function group(container: HTMLElement, label: string): HTMLElement {
  const element = [...container.querySelectorAll('fieldset')].find(
    (fieldset) => fieldset.querySelector('legend')?.textContent === label,
  );
  if (!(element instanceof HTMLElement)) throw new Error(`Missing group: ${label}`);
  return element;
}

function buttonNamed(scope: HTMLElement, name: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === name,
  );
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing button: ${name}`);
  return button;
}

function click(element: HTMLElement) {
  act(() => element.click());
}

/** The input named by its label, the way a screen reader finds it. */
function inputLabelled(container: HTMLElement, label: string): HTMLInputElement {
  const element = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  );
  const input = element?.htmlFor ? document.getElementById(element.htmlFor) : null;
  if (!(input instanceof HTMLInputElement)) throw new Error(`Missing input: ${label}`);
  return input;
}

/** Sets a controlled input the way the browser does, so React sees the change. */
function typeInto(input: HTMLInputElement, value: string) {
  // oxlint-disable-next-line typescript/unbound-method -- the native setter is invoked with the input as `this` on the next line.
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function chromeMode(container: HTMLElement): string | undefined {
  return container.querySelector<HTMLElement>('[data-testid="chrome"]')?.dataset.mode;
}

describe('ReaderScreen settings', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('leaving the strip through a layout (#224 vertical-forces-LTR)', () => {
    it('Given RTL paged reading, When the chrome goes to the strip and back to single, Then RTL returns', () => {
      const { root, container, changes } = renderReader(buildData({ readingMode: 'rtl' }));

      click(buttonNamed(container, 'Chrome scroll'));
      expect(chromeMode(container)).toBe('scroll');
      click(buttonNamed(container, 'Chrome single'));

      expect(changes.at(-1)?.patch).toEqual({ pageLayout: 'single', readingMode: 'rtl' });
      expect(chromeMode(container)).toBe('single');
      act(() => root.unmount());
    });

    it('Given RTL paged reading, When the sheet picks the strip and then a page layout, Then RTL returns', () => {
      const { root, container, changes } = renderReader(buildData({ readingMode: 'rtl' }));

      click(buttonNamed(container, 'Settings'));
      click(buttonNamed(group(container, 'Reading mode'), 'Vertical scroll'));
      click(buttonNamed(group(container, 'Page layout'), 'Double page'));

      expect(changes.at(-1)?.patch).toEqual({ pageLayout: 'double', readingMode: 'rtl' });
      act(() => root.unmount());
    });

    it('Given a title opened in the strip and a global RTL row, When a page layout is chosen, Then RTL is used', () => {
      const { root, container, changes } = renderReader(
        buildData({ readingMode: 'rtl' }, { readingMode: 'vertical' }),
      );

      click(buttonNamed(container, 'Chrome double'));

      expect(changes.at(-1)?.patch).toEqual({ pageLayout: 'double', readingMode: 'rtl' });
      act(() => root.unmount());
    });

    it('Given a strip with no paged direction anywhere, When a layout is chosen, Then paged LTR is the fallback', () => {
      const { root, container, changes } = renderReader(
        buildData({ readingMode: 'auto' }, { readingMode: 'vertical' }),
      );

      click(buttonNamed(container, 'Chrome single'));

      expect(changes.at(-1)?.patch).toEqual({ pageLayout: 'single', readingMode: 'ltr' });
      act(() => root.unmount());
    });

    it('Given the strip, When a direction is chosen deliberately, Then it is kept as chosen', () => {
      const { root, container, changes } = renderReader(buildData({ readingMode: 'vertical' }));

      click(buttonNamed(container, 'Settings'));
      click(buttonNamed(group(container, 'Reading mode'), 'Left to right'));

      expect(changes.at(-1)?.patch).toEqual({ readingMode: 'ltr' });
      act(() => root.unmount());
    });

    it('Given paged reading, When a layout is chosen, Then the direction is not touched', () => {
      const { root, container, changes } = renderReader(buildData({ readingMode: 'rtl' }));

      click(buttonNamed(container, 'Chrome double'));

      expect(changes.at(-1)?.patch).toEqual({ pageLayout: 'double' });
      act(() => root.unmount());
    });
  });

  describe('Applies to (R7)', () => {
    it('Given the quick panel opens, When a setting changes, Then it applies to this title by default', () => {
      const { root, container, changes } = renderReader(buildData({}));

      click(buttonNamed(container, 'Settings'));
      const scope = group(container, 'Applies to');
      expect(buttonNamed(scope, 'This title').getAttribute('aria-pressed')).toBe('true');
      expect(buttonNamed(scope, 'All titles').getAttribute('aria-pressed')).toBe('false');
      click(buttonNamed(group(container, 'Page fit'), 'Fit width'));

      expect(changes.at(-1)).toEqual({ patch: { fitMode: 'width' }, scope: 'title' });
      act(() => root.unmount());
    });

    it('Given All titles is chosen, When a setting changes, Then it is written globally, and reopening resets the scope', () => {
      const { root, container, changes } = renderReader(buildData({}));

      click(buttonNamed(container, 'Settings'));
      click(buttonNamed(group(container, 'Applies to'), 'All titles'));
      expect(container.textContent).toContain('Changes update your defaults for every title.');
      click(buttonNamed(group(container, 'Reading mode'), 'Right to left'));
      expect(changes.at(-1)).toEqual({ patch: { readingMode: 'rtl' }, scope: 'global' });

      click(buttonNamed(container, 'Close sheet'));
      click(buttonNamed(container, 'Settings'));

      expect(
        buttonNamed(group(container, 'Applies to'), 'This title').getAttribute('aria-pressed'),
      ).toBe('true');
      click(buttonNamed(group(container, 'Page fit'), 'Fit height'));
      expect(changes.at(-1)).toEqual({ patch: { fitMode: 'height' }, scope: 'title' });
      act(() => root.unmount());
    });

    it('Given the default scope, When the strip gap and background change, Then both apply to this title', () => {
      const { root, container, changes } = renderReader(buildData({}));

      click(buttonNamed(container, 'Settings'));
      const gap = inputLabelled(container, 'Strip gap');
      expect(gap.getAttribute('max')).toBe('64');
      expect(gap.getAttribute('aria-valuetext')).toBe('0px');
      typeInto(gap, '24');
      typeInto(inputLabelled(container, 'Background'), '#223344');

      expect(changes.slice(-2)).toEqual([
        { patch: { verticalGapPx: 24 }, scope: 'title' },
        { patch: { backgroundColor: '#223344' }, scope: 'title' },
      ]);
      expect(inputLabelled(container, 'Strip gap').getAttribute('aria-valuetext')).toBe('24px');
      act(() => root.unmount());
    });

    it('Given All titles, When the strip gap and background change, Then both are written globally', () => {
      const { root, container, changes } = renderReader(buildData({}));

      click(buttonNamed(container, 'Settings'));
      click(buttonNamed(group(container, 'Applies to'), 'All titles'));
      typeInto(inputLabelled(container, 'Strip gap'), '8');
      typeInto(inputLabelled(container, 'Background'), '#ffffff');

      expect(changes.slice(-2)).toEqual([
        { patch: { verticalGapPx: 8 }, scope: 'global' },
        { patch: { backgroundColor: '#ffffff' }, scope: 'global' },
      ]);
      act(() => root.unmount());
    });

    it('Given a misaligned spread, When Offset by one is chosen, Then this title pairs from the first page', () => {
      const { root, container, changes } = renderReader(buildData({}));

      click(buttonNamed(container, 'Settings'));
      const offset = group(container, 'Spread offset');
      expect(buttonNamed(offset, 'Cover alone').getAttribute('aria-pressed')).toBe('true');
      click(buttonNamed(offset, 'Offset by one'));

      expect(changes.at(-1)).toEqual({ patch: { spreadOffset: 1 }, scope: 'title' });
      expect(
        buttonNamed(group(container, 'Spread offset'), 'Offset by one').getAttribute(
          'aria-pressed',
        ),
      ).toBe('true');
      act(() => root.unmount());
    });

    it('Given the quick panel, When rendered, Then smart spread, L-shaped zones and Auto choices are offered with pressed state', () => {
      const { root, container, changes } = renderReader(
        buildData({ pageLayout: 'smartSpread', tapZoneLayout: 'lShaped' }),
      );

      click(buttonNamed(container, 'Settings'));
      expect(
        buttonNamed(group(container, 'Page layout'), 'Smart spread').getAttribute('aria-pressed'),
      ).toBe('true');
      expect(
        buttonNamed(group(container, 'Tap zones'), 'L-shaped').getAttribute('aria-pressed'),
      ).toBe('true');
      expect(
        buttonNamed(group(container, 'Reading mode'), 'Auto').getAttribute('aria-pressed'),
      ).toBe('true');
      expect(buttonNamed(group(container, 'Page fit'), 'Auto').getAttribute('aria-pressed')).toBe(
        'true',
      );
      click(buttonNamed(group(container, 'Tap zones'), 'Grid'));
      expect(changes.at(-1)?.patch).toEqual({ tapZoneLayout: 'grid' });
      act(() => root.unmount());
    });
  });
});
