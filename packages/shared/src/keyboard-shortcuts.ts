import type { KeyboardShortcut, KeyboardShortcutAction } from './reader-settings.js';

export const KEYBOARD_SHORTCUT_ACTIONS: readonly KeyboardShortcutAction[] = [
  'nextPage',
  'prevPage',
  'firstPage',
  'lastPage',
  'nextChapter',
  'prevChapter',
  'toggleChrome',
  'toggleFullscreen',
];

export const KEYBOARD_SHORTCUT_ACTION_LABELS: Readonly<Record<KeyboardShortcutAction, string>> = {
  nextPage: 'Next page',
  prevPage: 'Previous page',
  firstPage: 'First page',
  lastPage: 'Last page',
  nextChapter: 'Next chapter',
  prevChapter: 'Previous chapter',
  toggleChrome: 'Show or hide controls',
  toggleFullscreen: 'Toggle fullscreen',
};

export const KEYBOARD_SHORTCUT_MODIFIERS = ['Control', 'Alt', 'Shift', 'Meta'] as const;

/** Keys the reader owns for modal exit or focus movement; binding them would trap the user. */
const RESERVED_KEYS: readonly string[] = ['Escape', 'Tab'];

/** KeyboardEvent.key for space is a single space; store it by name. */
export function normalizeShortcutKey(key: string): string {
  if (key === ' ') return 'Space';
  return key.length === 1 ? key.toLowerCase() : key;
}

type ShortcutModifier = (typeof KEYBOARD_SHORTCUT_MODIFIERS)[number];

function normalizeModifiers(modifiers: readonly string[] | undefined): readonly ShortcutModifier[] {
  if (modifiers === undefined) return [];
  const known = modifiers.filter((modifier): modifier is ShortcutModifier =>
    (KEYBOARD_SHORTCUT_MODIFIERS as readonly string[]).includes(modifier),
  );
  return [...new Set(known)].sort(
    (left, right) =>
      KEYBOARD_SHORTCUT_MODIFIERS.indexOf(left) - KEYBOARD_SHORTCUT_MODIFIERS.indexOf(right),
  );
}

export function normalizeKeyboardShortcut(shortcut: KeyboardShortcut): KeyboardShortcut {
  const modifiers = normalizeModifiers(shortcut.modifiers);
  return {
    action: shortcut.action,
    key: normalizeShortcutKey(shortcut.key),
    ...(modifiers.length > 0 ? { modifiers: [...modifiers] } : {}),
  };
}

/** Stable identity for conflict checks and persistence comparisons. */
export function keyboardShortcutId(shortcut: KeyboardShortcut): string {
  const normalized = normalizeKeyboardShortcut(shortcut);
  return `${(normalized.modifiers ?? []).join('+')}\u0000${normalized.key}`;
}

export function keyboardEventMatches(
  event: {
    readonly key: string;
    readonly ctrlKey?: boolean;
    readonly altKey?: boolean;
    readonly shiftKey?: boolean;
    readonly metaKey?: boolean;
  },
  shortcut: KeyboardShortcut,
): boolean {
  const normalized = normalizeKeyboardShortcut(shortcut);
  const modifiers = normalized.modifiers ?? [];
  const expected = {
    Control: event.ctrlKey === true,
    Alt: event.altKey === true,
    Shift: event.shiftKey === true,
    Meta: event.metaKey === true,
  };
  if (modifiers.length !== Object.values(expected).filter(Boolean).length) return false;
  if (modifiers.some((modifier) => expected[modifier as keyof typeof expected] !== true)) {
    return false;
  }
  return normalizeShortcutKey(event.key) === normalized.key;
}

/** The binding already used by a different action, if any. */
export function findKeyboardShortcutConflict(
  shortcuts: readonly KeyboardShortcut[],
  candidate: KeyboardShortcut,
): KeyboardShortcut | undefined {
  const id = keyboardShortcutId(candidate);
  return shortcuts.find(
    (shortcut) => shortcut.action !== candidate.action && keyboardShortcutId(shortcut) === id,
  );
}

export function isReservedShortcutKey(key: string): boolean {
  return RESERVED_KEYS.includes(normalizeShortcutKey(key));
}

const KEY_LABELS: Readonly<Record<string, string>> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Space: 'Space',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
};

export function formatKeyboardShortcut(shortcut: KeyboardShortcut): string {
  const normalized = normalizeKeyboardShortcut(shortcut);
  return [
    ...(normalized.modifiers ?? []),
    KEY_LABELS[normalized.key] ?? normalized.key.toUpperCase(),
  ].join(' + ');
}

/** Default bindings shown in the editor; the reader also keeps its wider built-in fallbacks. */
export function defaultKeyboardShortcuts(
  readingMode: 'rtl' | 'ltr' | 'vertical',
): readonly KeyboardShortcut[] {
  const rtl = readingMode === 'rtl';
  return [
    { action: 'nextPage', key: rtl ? 'ArrowLeft' : 'ArrowRight' },
    { action: 'prevPage', key: rtl ? 'ArrowRight' : 'ArrowLeft' },
    { action: 'firstPage', key: 'Home' },
    { action: 'lastPage', key: 'End' },
    { action: 'nextChapter', key: 'ArrowRight', modifiers: ['Shift'] },
    { action: 'prevChapter', key: 'ArrowLeft', modifiers: ['Shift'] },
    { action: 'toggleChrome', key: 'h' },
    { action: 'toggleFullscreen', key: 'f' },
  ];
}
