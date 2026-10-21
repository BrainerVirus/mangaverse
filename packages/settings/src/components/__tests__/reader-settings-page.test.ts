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

describe('ReaderSettingsPage', () => {
  it('Given the reader settings, Then sections are common first with Advanced collapsed last', () => {
    const sections = sectionsOf(renderPage());

    expect(sections.map((section) => section.props.title)).toEqual([
      'Reading mode',
      'Navigation',
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
        'fit-mode',
        'tap-zone-layout',
        'navigation-direction',
        'wheel-behavior',
        'chrome-visibility',
        'page-transition',
        'background-color',
        'brightness',
        'vertical-gap',
        'keep-screen-on',
        'fullscreen-on-open',
        'image-smoothing',
        'remember-per-title',
        'preload-ahead',
        'prefetch-budget',
        'low-memory-mode',
        'long-strip-optimization',
        'tap-zone-debug-overlay',
        'diagnostics-enabled',
      ].sort(),
    );
    expect(settingIds(byTitle.get('Performance') ?? null)).toContain('prefetch-budget');
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
    const onChange = vi.fn<(next: ReaderSettings) => void>();
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

  it('Given the budget slider, Then it shows MiB, reaches the cap and saves bytes', () => {
    const onChange = vi.fn<(next: ReaderSettings) => void>();
    const page = ReaderSettingsPage({
      settings: getDefaultReaderSettings(),
      isLoading: false,
      isError: false,
      onChange,
    });
    const slider = collectElements(page).find(
      (element) => (element.props as { id?: unknown }).id === 'prefetch-budget',
    );
    if (slider === undefined) throw new Error('prefetch budget slider is missing');
    const sliderProps = slider.props as {
      value?: unknown;
      min?: unknown;
      max?: unknown;
      step?: unknown;
      onChange?: (value: number) => void;
    };

    function renderedSliderValueText(element: ReactElement): unknown {
      const rendered = (element.type as (props: unknown) => ReactElement)(element.props);
      const inner = collectElements(rendered).find((child) => child.type === Slider);
      if (inner === undefined) throw new Error('slider input is missing');
      return (inner.props as { 'aria-valuetext'?: unknown })['aria-valuetext'];
    }

    expect(sliderProps.value).toBe(250);
    expect(sliderProps.max).toBe(2048);
    // The last step must land exactly on the 2 GiB cap.
    expect(
      ((sliderProps.max as number) - (sliderProps.min as number)) % (sliderProps.step as number),
    ).toBe(0);
    expect(renderedSliderValueText(slider)).toBe('250 MiB');

    const unlimited = collectElements(
      ReaderSettingsPage({
        settings: { ...getDefaultReaderSettings(), prefetchBudgetBytes: 0 },
        isLoading: false,
        isError: false,
        onChange,
      }),
    ).find((element) => (element.props as { id?: unknown }).id === 'prefetch-budget');
    if (unlimited === undefined) throw new Error('prefetch budget slider is missing');
    expect(renderedSliderValueText(unlimited)).toBe('Unlimited');

    sliderProps.onChange?.(100);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ prefetchBudgetBytes: 100 * 1024 * 1024 }),
    );
  });
});
