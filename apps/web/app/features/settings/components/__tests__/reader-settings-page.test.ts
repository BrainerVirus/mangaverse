// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { SettingsSection, Slider } from '@app/design-system';
import { getReaderSettings, upsertReaderSettings } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import {
  getDefaultReaderSettings,
  PREFETCH_BUDGET_DEFAULT_BYTES,
  PREFETCH_BUDGET_MAX_BYTES,
  validateReaderSettings,
  type ReaderSettings,
} from '@app/shared';

import { ReaderSettingsPage } from '../ReaderSettingsPage.js';
import {
  DisplaySettingsSection,
  GestureSettingsSection,
  KeyboardShortcutsSection,
} from '../ReaderSettingsPage.js';

interface SectionProps {
  readonly title?: string;
  readonly collapsed?: boolean;
  readonly children?: ReactNode;
}

/** Every element in a rendered tree, parents before children. */
function collectElements(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) {
    return (node as ReactNode[]).flatMap(collectElements);
  }
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  const type = element.type as unknown;
  // Section components are plain functions; expanding them keeps this walk
  // inspecting the same element tree the page actually composes.
  if (
    type === KeyboardShortcutsSection ||
    type === GestureSettingsSection ||
    type === DisplaySettingsSection
  ) {
    const render = type as (props: unknown) => ReactElement;
    return [element, ...collectElements(render(element.props))];
  }
  return [element, ...collectElements(element.props.children)];
}

function renderPage() {
  return ReaderSettingsPage({
    settings: getDefaultReaderSettings(),
    isLoading: false,
    isError: false,
    onChange: () => {},
  });
}

function sectionsOf(page: ReactNode): ReactElement<SectionProps>[] {
  return collectElements(page).filter(
    (element) => element.type === SettingsSection,
  ) as ReactElement<SectionProps>[];
}

function settingIds(node: ReactNode): string[] {
  return collectElements(node)
    .map((element) => (element.props as { id?: unknown }).id)
    .filter((id): id is string => typeof id === 'string');
}

const MIB = 1024 * 1024;

function rowWithId(page: ReactNode, id: string): ReactElement {
  const row = collectElements(page).find(
    (element) => (element.props as { id?: unknown }).id === id,
  );
  if (row === undefined) throw new Error(`${id} row is missing`);
  return row;
}

/** The value text the row's slider announces. */
function renderedSliderValueText(element: ReactElement): unknown {
  const rendered = (element.type as (props: unknown) => ReactElement)(element.props);
  const inner = collectElements(rendered).find((child) => child.type === Slider);
  if (inner === undefined) throw new Error('slider input is missing');
  return (inner.props as { 'aria-valuetext'?: unknown })['aria-valuetext'];
}

function budgetRow(
  settings: ReaderSettings,
  onChange: (patch: Partial<ReaderSettings>) => void,
  onInteractionEnd?: () => void,
) {
  const page = ReaderSettingsPage({
    settings,
    isLoading: false,
    isError: false,
    onChange,
    ...(onInteractionEnd === undefined ? {} : { onInteractionEnd }),
  });
  return rowWithId(page, 'prefetch-budget').props as {
    value: string;
    options: readonly { value: string; label: string }[];
    onChange: (value: string) => void;
  };
}

describe('ReaderSettingsPage', () => {
  it('Given the reader settings, Then sections are common first with Advanced collapsed last', () => {
    const sections = sectionsOf(renderPage());

    expect(sections.map((section) => section.props.title)).toEqual([
      'Reading mode',
      'Navigation',
      'Keyboard shortcuts',
      'Gestures',
      'Display',
      'Behavior',
      'Performance',
      'Advanced',
    ]);
    expect(sections.map((section) => section.props.collapsed === true)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('Given the reader settings, Then every setting stays rendered and the budget lives in Performance', () => {
    const page = renderPage();
    const byTitle = new Map(sectionsOf(page).map((section) => [section.props.title, section]));

    expect(settingIds(page).sort()).toEqual(
      [
        'reading-mode',
        'page-layout',
        'spread-offset',
        'fit-mode',
        'tap-zone-layout',
        'navigation-direction',
        'wheel-behavior',
        'gesture-sensitivity',
        'pinch-sensitivity',
        'double-tap-zoom',
        'chrome-visibility',
        'page-transition',
        'background-color',
        'vertical-gap',
        'max-strip-width',
        'show-page-number',
        'show-chapter-transition',
        'keep-screen-on',
        'fullscreen-on-open',
        'image-smoothing',
        'preload-ahead',
        'preload-behind',
        'prefetch-budget',
        'low-memory-mode',
        'long-strip-optimization',
        'tap-zone-debug-overlay',
        'diagnostics-enabled',
      ].sort(),
    );
    expect(settingIds(byTitle.get('Reading mode') ?? null)).toEqual(
      expect.arrayContaining(['spread-offset']),
    );
    expect(settingIds(byTitle.get('Display') ?? null)).toEqual(
      expect.arrayContaining(['max-strip-width', 'show-page-number', 'show-chapter-transition']),
    );
    expect(settingIds(byTitle.get('Performance') ?? null)).toEqual(
      expect.arrayContaining(['preload-ahead', 'preload-behind', 'prefetch-budget']),
    );
    expect(settingIds(byTitle.get('Advanced') ?? null)).toEqual(
      expect.arrayContaining([
        'low-memory-mode',
        'long-strip-optimization',
        'tap-zone-debug-overlay',
        'diagnostics-enabled',
      ]),
    );
  });

  it('Given a legacy stored settings object, Then validation defaults the prefetch budget', () => {
    const legacy: Record<string, unknown> = { ...getDefaultReaderSettings() };
    delete legacy['prefetchBudgetBytes'];

    const result = validateReaderSettings(legacy);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.prefetchBudgetBytes : 0).toBe(PREFETCH_BUDGET_DEFAULT_BYTES);
  });

  it('Given a stored prefetch budget, Then it round-trips and rejects values out of range', () => {
    const base = getDefaultReaderSettings();
    const budget = 500 * 1024 * 1024;

    const result = validateReaderSettings({ ...base, prefetchBudgetBytes: budget });

    expect(result.ok ? result.value.prefetchBudgetBytes : 0).toBe(budget);
    expect(validateReaderSettings({ ...base, prefetchBudgetBytes: 0 }).ok).toBe(true);
    expect(validateReaderSettings({ ...base, prefetchBudgetBytes: -1 }).ok).toBe(false);
    expect(
      validateReaderSettings({ ...base, prefetchBudgetBytes: PREFETCH_BUDGET_MAX_BYTES + 1 }).ok,
    ).toBe(false);
    expect(validateReaderSettings({ ...base, prefetchBudgetBytes: 1.5 }).ok).toBe(false);
  });

  it('Given a custom prefetch budget, When stored and reloaded, Then the settings round-trip keeps it', async () => {
    const { db } = await createSqlJsHarness();
    const settings = {
      ...getDefaultReaderSettings(),
      prefetchBudgetBytes: 500 * 1024 * 1024,
    };

    await upsertReaderSettings(db, settings);

    expect(await getReaderSettings(db)).toEqual(settings);
  });

  it('Given a discrete toggle, When it changes, Then the interaction commits after the change', () => {
    const onChange = vi.fn<(patch: Partial<ReaderSettings>) => void>();
    const onInteractionEnd = vi.fn<() => void>();
    const page = ReaderSettingsPage({
      settings: getDefaultReaderSettings(),
      isLoading: false,
      isError: false,
      onChange,
      onInteractionEnd,
    });
    const toggle = collectElements(page).find(
      (element) => (element.props as { id?: unknown }).id === 'keep-screen-on',
    );
    if (toggle === undefined) throw new Error('keep-screen-on toggle is missing');
    const props = toggle.props as {
      onCheckedChange?: (checked: boolean) => void;
    };

    props.onCheckedChange?.(true);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ keepScreenOn: true }));
    expect(onInteractionEnd).toHaveBeenCalledTimes(1);
  });

  it('Given two quick edits, When each fires, Then the page emits patches so neither edit is lost', () => {
    const onChange = vi.fn<(patch: Partial<ReaderSettings>) => void>();
    const page = ReaderSettingsPage({
      settings: getDefaultReaderSettings(),
      isLoading: false,
      isError: false,
      onChange,
    });
    const changeRow = (id: string) =>
      (rowWithId(page, id).props as { onChange: (value: never) => void }).onChange;

    changeRow('chrome-visibility')('always' as never);
    changeRow('vertical-gap')(16 as never);

    // A patch carries only the edited field; merging over the cache is the
    // route's job, so a control rendered before the previous re-render cannot
    // write its stale copy of every other setting.
    expect(onChange).toHaveBeenNthCalledWith(1, { chromeVisibility: 'always' });
    expect(onChange).toHaveBeenNthCalledWith(2, { verticalGapPx: 16 });
  });

  it('Given the budget presets, Then the stored bytes pick a preset and a choice saves its bytes', () => {
    const onChange = vi.fn<(patch: Partial<ReaderSettings>) => void>();
    const onInteractionEnd = vi.fn<() => void>();
    const budget = budgetRow(getDefaultReaderSettings(), onChange, onInteractionEnd);

    expect(budget.value).toBe(String(PREFETCH_BUDGET_DEFAULT_BYTES));
    expect(budget.options.map((option) => option.label)).toEqual([
      'Unlimited',
      '100 MB',
      '250 MB (default)',
      '500 MB',
      '1 GB',
    ]);
    expect(budget.options.map((option) => Number(option.value))).toEqual([
      0,
      100 * MIB,
      250 * MIB,
      500 * MIB,
      1024 * MIB,
    ]);

    budget.onChange('0');
    expect(onChange).toHaveBeenLastCalledWith({ prefetchBudgetBytes: 0 });
    budget.onChange(String(1024 * MIB));
    expect(onChange).toHaveBeenLastCalledWith({ prefetchBudgetBytes: 1024 * MIB });
    expect(onInteractionEnd).toHaveBeenCalledTimes(2);
  });

  it('Given a stored budget that matches no preset, Then it shows as Custom and is kept as stored', () => {
    const onChange = vi.fn<(patch: Partial<ReaderSettings>) => void>();
    const stored = { ...getDefaultReaderSettings(), prefetchBudgetBytes: 300 * MIB };
    const budget = budgetRow(stored, onChange);

    expect(budget.value).toBe('custom');
    expect(budget.options.at(-1)).toEqual({ value: 'custom', label: 'Custom' });
    budget.onChange('custom');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Given the max strip width, Then it spans 40-100% and labels 100% as auto', () => {
    const onChange = vi.fn<(patch: Partial<ReaderSettings>) => void>();
    const row = (maxStripWidthPercent: number) =>
      rowWithId(
        ReaderSettingsPage({
          settings: { ...getDefaultReaderSettings(), maxStripWidthPercent },
          isLoading: false,
          isError: false,
          onChange,
        }),
        'max-strip-width',
      );

    const auto = row(100);
    expect(auto.props).toMatchObject({ value: 100, min: 40, max: 100 });
    expect(renderedSliderValueText(auto)).toBe('100% (auto)');
    expect(renderedSliderValueText(row(80))).toBe('80%');
    (auto.props as { onChange: (value: number) => void }).onChange(80);
    expect(onChange).toHaveBeenLastCalledWith({ maxStripWidthPercent: 80 });
  });

  it('Given the spread offset, the page number and the transition screen, When changed, Then each saves its field', () => {
    const onChange = vi.fn<(patch: Partial<ReaderSettings>) => void>();
    const page = ReaderSettingsPage({
      settings: getDefaultReaderSettings(),
      isLoading: false,
      isError: false,
      onChange,
    });
    const offset = rowWithId(page, 'spread-offset').props as {
      value: string;
      options: readonly { value: string; label: string }[];
      onChange: (value: string) => void;
    };
    const toggle = (id: string) =>
      rowWithId(page, id).props as {
        checked: boolean;
        onCheckedChange: (checked: boolean) => void;
      };

    expect(offset.value).toBe('0');
    expect(offset.options.map((option) => option.label)).toEqual(['Cover alone', 'Offset by one']);
    offset.onChange('1');
    expect(onChange).toHaveBeenLastCalledWith({ spreadOffset: 1 });

    expect(toggle('show-page-number').checked).toBe(true);
    toggle('show-page-number').onCheckedChange(false);
    expect(onChange).toHaveBeenLastCalledWith({ showPageNumber: false });
    expect(toggle('show-chapter-transition').checked).toBe(true);
    toggle('show-chapter-transition').onCheckedChange(false);
    expect(onChange).toHaveBeenLastCalledWith({ showChapterTransition: false });
  });
});
