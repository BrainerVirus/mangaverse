// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { getDefaultReaderSettings } from '@app/shared';
import { toReaderEngineSettings } from '../to-reader-engine-settings.js';
import type { ReaderNavigationAction, ReaderSessionInput } from '../types.js';
import { useReaderKeyboard } from './use-reader-listeners.js';

const sessionInput: ReaderSessionInput = {
  chapter: {
    id: 'chapter-1' as ReaderSessionInput['chapter']['id'],
    mangaId: 'manga-1' as ReaderSessionInput['chapter']['mangaId'],
    title: 'Chapter 1',
    pages: [],
    pageCount: 3,
  },
  viewport: { width: 800, height: 600, orientation: 'portrait' },
  settings: toReaderEngineSettings(getDefaultReaderSettings()),
};

function Harness({
  actions,
  disabled = false,
  onClose,
}: {
  actions: ReaderNavigationAction[];
  disabled?: boolean;
  onClose?: (() => void) | undefined;
}) {
  useReaderKeyboard({
    sessionInput,
    navigate: (action) => actions.push(action),
    reducedMotion: true,
    scrollHandle: { current: null },
    verticalTarget: { current: 0 },
    verticalTargetPending: { current: false },
    disabled,
    onClose,
  });
  return null;
}

function mount(options: { disabled?: boolean; onClose?: () => void } = {}): {
  root: Root;
  container: HTMLElement;
  actions: ReaderNavigationAction[];
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const actions: ReaderNavigationAction[] = [];
  act(() => {
    root.render(<Harness actions={actions} {...options} />);
  });
  return { root, container, actions };
}

function unmount({ root, container }: { root: Root; container: HTMLElement }) {
  act(() => root.unmount());
  container.remove();
}

function press(key: string, target: EventTarget = window) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

describe('useReaderKeyboard', () => {
  it('Given reader focus, When an arrow key is pressed, Then the page navigates', () => {
    const mounted = mount();
    press('ArrowRight');
    expect(mounted.actions).toEqual([{ type: 'nextPage' }]);
    unmount(mounted);
  });

  it('Given a focused button, When an arrow key or Space is pressed, Then only the arrow pages', () => {
    const mounted = mount();
    const button = document.createElement('button');
    mounted.container.append(button);

    press('ArrowRight', button);
    expect(mounted.actions).toEqual([{ type: 'nextPage' }]);

    press(' ', button);
    expect(mounted.actions).toEqual([{ type: 'nextPage' }]);
    unmount(mounted);
  });

  it('Given a form field or slider, When a navigation key is pressed, Then the reader stays put', () => {
    const mounted = mount();
    for (const markup of [
      '<input value="" />',
      '<textarea></textarea>',
      '<div role="slider" aria-valuenow="1"></div>',
      '<div role="combobox"></div>',
    ]) {
      const holder = document.createElement('div');
      holder.innerHTML = markup;
      const field = holder.firstElementChild;
      if (field === null) throw new Error('control did not parse');
      mounted.container.append(holder);
      press('ArrowRight', field);
      expect(mounted.actions).toEqual([]);
    }
    unmount(mounted);
  });

  it('Given an open dialog or a disabled session, When a key is pressed, Then the reader ignores it', () => {
    const disabled = mount({ disabled: true });
    press('ArrowRight');
    expect(disabled.actions).toEqual([]);
    unmount(disabled);

    const modal = mount();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    modal.container.append(dialog);
    press('ArrowRight', dialog);
    expect(modal.actions).toEqual([]);
    unmount(modal);
  });

  it('Given a close action, When Escape is pressed, Then the reader closes', () => {
    const onClose = vi.fn<() => void>();
    const mounted = mount({ onClose });
    press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mounted.actions).toEqual([]);
    unmount(mounted);
  });
});
