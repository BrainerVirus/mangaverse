import { describe, expect, it } from 'vitest';
import {
  defaultKeyboardShortcuts,
  findKeyboardShortcutConflict,
  formatKeyboardShortcut,
  isReservedShortcutKey,
  keyboardEventMatches,
  normalizeKeyboardShortcut,
} from './keyboard-shortcuts.js';
import type { KeyboardShortcut } from './reader-settings.js';
import { validateReaderSettings } from './reader-settings.js';

const next = { action: 'nextPage', key: 'n' } as const;
const prev = { action: 'prevPage', key: 'p' } as const;

describe('keyboard shortcut helpers', () => {
  it('normalizes modifiers and the space key into one stable form', () => {
    expect(
      normalizeKeyboardShortcut({ action: 'nextPage', key: ' ', modifiers: ['Shift', 'Control'] }),
    ).toEqual({ action: 'nextPage', key: 'Space', modifiers: ['Control', 'Shift'] });
  });

  it('matches only the exact modifier set', () => {
    const binding: KeyboardShortcut = { action: 'toggleChrome', key: 'h', modifiers: ['Shift'] };
    expect(keyboardEventMatches({ key: 'H', shiftKey: true }, binding)).toBe(true);
    expect(keyboardEventMatches({ key: 'h' }, binding)).toBe(false);
    expect(keyboardEventMatches({ key: 'h', shiftKey: true, ctrlKey: true }, binding)).toBe(false);
  });

  it('reports a binding already owned by another action and ignores the same action', () => {
    expect(findKeyboardShortcutConflict([next], prev)).toBeUndefined();
    const conflict = findKeyboardShortcutConflict([next], {
      action: 'prevPage',
      key: 'N',
    });
    expect(conflict?.action).toBe('nextPage');
  });

  it('keeps Escape and Tab reserved so the reader can always be left', () => {
    expect(isReservedShortcutKey('Escape')).toBe(true);
    expect(isReservedShortcutKey('Tab')).toBe(true);
    expect(isReservedShortcutKey('ArrowRight')).toBe(false);
  });

  it('formats arrows and named keys for the editor', () => {
    expect(formatKeyboardShortcut({ action: 'nextPage', key: 'ArrowRight' })).toBe('→');
    expect(
      formatKeyboardShortcut({ action: 'nextChapter', key: 'ArrowRight', modifiers: ['Shift'] }),
    ).toBe('Shift + →');
  });

  it('defaults follow the reading direction', () => {
    const ltr = defaultKeyboardShortcuts('ltr');
    const rtl = defaultKeyboardShortcuts('rtl');
    expect(ltr.find((shortcut) => shortcut.action === 'nextPage')?.key).toBe('ArrowRight');
    expect(rtl.find((shortcut) => shortcut.action === 'nextPage')?.key).toBe('ArrowLeft');
  });
});

describe('keyboard shortcut validation', () => {
  it('Given an unknown action or empty key, When validating, Then the settings are rejected', () => {
    const base = {
      readingMode: 'ltr',
      pageLayout: 'single',
      fitMode: 'width',
      tapZoneLayout: 'leftRight',
      tapZoneDebugOverlay: false,
      navigationDirection: 'default',
      pageTransition: 'fade',
      chromeVisibility: 'auto',
      preloadAhead: 2,
      verticalGapPx: 8,
      minZoom: 1,
      maxZoom: 3,
      doubleTapZoom: 1.5,
      pinchSensitivity: 1,
      gestureSensitivity: 1,
      brightness: 1,
      backgroundColor: '#000000',
      imageSmoothing: true,
      keepScreenOn: true,
      fullscreenOnOpen: false,
      wheelBehavior: 'scroll',
      longStripOptimization: true,
      lowMemoryMode: false,
      diagnosticsEnabled: false,
      rememberPerTitleOverrides: true,
    };
    expect(
      validateReaderSettings({
        ...base,
        keyboardShortcuts: [{ action: 'explode', key: 'x' }],
      }).ok,
    ).toBe(false);
    expect(
      validateReaderSettings({ ...base, keyboardShortcuts: [{ action: 'nextPage', key: '' }] }).ok,
    ).toBe(false);
    expect(
      validateReaderSettings({
        ...base,
        keyboardShortcuts: [{ action: 'nextPage', key: 'n', modifiers: ['Hyper'] }],
      }).ok,
    ).toBe(false);
  });
});
