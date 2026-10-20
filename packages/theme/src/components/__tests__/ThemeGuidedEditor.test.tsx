import { describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { Button, Label, Slider } from '@app/design-system';
import type { ThemeDefinition, ThemeSeeds } from '@app/shared';
import { THEME_DEFINITION_SCHEMA_VERSION } from '@app/shared';

import { presetToThemeDefinition } from '../../built-in-themes.js';
import { getThemePreset } from '../../presets.js';
import { GuidedAppearancePanel, ThemeGuidedEditor } from '../ThemeGuidedEditor.js';
import {
  GUIDED_SEED_FIELDS,
  buildContrastPairs,
  readGuidedOklch,
  readSurfaceWarmth,
  readTextContrast,
} from '../theme-guided.js';

function definition(
  patch: { light?: Partial<ThemeSeeds>; dark?: Partial<ThemeSeeds> } = {},
): ThemeDefinition {
  const preset = presetToThemeDefinition(getThemePreset('default'));
  return {
    schemaVersion: THEME_DEFINITION_SCHEMA_VERSION,
    id: 'custom-guided',
    name: 'Guided test',
    light: { seeds: { ...preset.light.seeds, ...patch.light } },
    dark: { seeds: { ...preset.dark.seeds, ...patch.dark } },
  };
}

function propsOf(element: ReactElement): Record<string, unknown> {
  return element.props as Record<string, unknown>;
}

function collectElements(node: ReactNode): ReactElement[] {
  const out: ReactElement[] = [];
  const visit = (value: ReactNode) => {
    if (Array.isArray(value)) {
      for (const child of value) {
        visit(child as ReactNode);
      }
      return;
    }
    if (isValidElement(value)) {
      out.push(value);
      visit((value.props as { children?: ReactNode }).children);
    }
  };
  visit(node);
  return out;
}

function collectText(node: ReactNode): string {
  const parts: string[] = [];
  const visit = (value: ReactNode) => {
    if (typeof value === 'string') {
      parts.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        visit(child as ReactNode);
      }
      return;
    }
    if (isValidElement(value)) {
      visit((value.props as { children?: ReactNode }).children);
    }
  };
  visit(node);
  return parts.join(' ');
}

function sliderByLabel(elements: readonly ReactElement[], label: string): ReactElement {
  const slider = elements.find(
    (element) => element.type === Slider && propsOf(element)['aria-label'] === label,
  );
  if (slider === undefined) {
    throw new Error(`Missing slider ${label}`);
  }
  return slider;
}

function fireSlider(slider: ReactElement, value: string) {
  const onChange = propsOf(slider)['onChange'] as (event: { target: { value: string } }) => void;
  onChange({ target: { value } });
}

describe('ThemeGuidedEditor structure', () => {
  it('renders the guided root and one panel per appearance', () => {
    const tree = ThemeGuidedEditor({ draft: definition(), onChange: vi.fn<() => void>() });
    const elements = collectElements(tree);

    expect(
      elements.some((element) => propsOf(element)['data-testid'] === 'theme-guided-editor'),
    ).toBe(true);
    const panels = elements.filter((element) => element.type === GuidedAppearancePanel);
    expect(panels.map((panel) => propsOf(panel)['appearance'])).toEqual(['light', 'dark']);
  });
});

describe('GuidedAppearancePanel seed controls', () => {
  it('gives every seed lightness, chroma and hue sliders with unique labels', () => {
    const panel = GuidedAppearancePanel({
      draft: definition(),
      appearance: 'light',
      onChange: vi.fn<() => void>(),
    });
    const elements = collectElements(panel);
    const sliders = elements.filter((element) => element.type === Slider);
    const labels = sliders.map((slider) => propsOf(slider)['aria-label']);

    for (const field of GUIDED_SEED_FIELDS) {
      expect(labels).toContain(`${field.label} lightness`);
      expect(labels).toContain(`${field.label} chroma`);
      expect(labels).toContain(`${field.label} hue`);
    }
    expect(labels).toHaveLength(GUIDED_SEED_FIELDS.length * 3 + 4);
    expect(new Set(labels).size).toBe(labels.length);

    for (const field of GUIDED_SEED_FIELDS) {
      const card = elements.find(
        (element) => propsOf(element)['data-testid'] === `seed-light-${field.name}`,
      );
      expect(card).toBeDefined();
    }
  });

  it('sends seed edits through onChange so the shell preview updates', () => {
    const onChange = vi.fn<(next: ThemeDefinition) => void>();
    const elements = collectElements(
      GuidedAppearancePanel({ draft: definition(), appearance: 'light', onChange }),
    );

    fireSlider(sliderByLabel(elements, 'Canvas lightness'), '0.9');

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0];
    expect(readGuidedOklch(next!.light.seeds.background)?.l).toBeCloseTo(0.9, 2);
    expect(next!.dark.seeds).toEqual(definition().dark.seeds);
  });

  it('links each slider to a Label', () => {
    const elements = collectElements(
      GuidedAppearancePanel({
        draft: definition(),
        appearance: 'dark',
        onChange: vi.fn<() => void>(),
      }),
    );
    const labels = elements.filter((element) => element.type === Label);
    const sliderIds = elements
      .filter((element) => element.type === Slider)
      .map((slider) => propsOf(slider)['id']);

    expect(labels.length).toBeGreaterThanOrEqual(sliderIds.length);
    for (const id of sliderIds) {
      expect(labels.some((label) => propsOf(label)['htmlFor'] === id)).toBe(true);
    }
  });

  it('moves accent hue and chroma and the surface warmth', () => {
    const onChange = vi.fn<(next: ThemeDefinition) => void>();
    const elements = collectElements(
      GuidedAppearancePanel({
        draft: definition({ light: { accent: 'oklch(0.6 0.05 265)' } }),
        appearance: 'light',
        onChange,
      }),
    );

    fireSlider(sliderByLabel(elements, 'Surface warmth'), '100');
    const warmed = onChange.mock.calls.at(-1)?.[0];
    expect(readSurfaceWarmth(warmed!.light.seeds)).toBeGreaterThanOrEqual(85);

    fireSlider(sliderByLabel(elements, 'Accent hue'), '300');
    const hued = onChange.mock.calls.at(-1)?.[0];
    expect(readGuidedOklch(hued!.light.seeds.accent)?.h).toBeCloseTo(300, 0);

    fireSlider(sliderByLabel(elements, 'Accent chroma'), '0.2');
    const saturated = onChange.mock.calls.at(-1)?.[0];
    expect(readGuidedOklch(saturated!.light.seeds.accent)?.c).toBeGreaterThan(0.05);
  });
});

describe('GuidedAppearancePanel contrast checks', () => {
  it('renders a meter for every pair with its ratio and status', () => {
    const panel = GuidedAppearancePanel({
      draft: definition(),
      appearance: 'light',
      onChange: vi.fn<() => void>(),
    });
    const elements = collectElements(panel);
    const meters = elements.filter((element) =>
      String(propsOf(element)['data-testid'] ?? '').startsWith('contrast-light-'),
    );

    expect(meters).toHaveLength(8);
    const text = collectText(panel);
    const textPair = buildContrastPairs(definition(), 'light')[0]!;
    expect(text).toContain(textPair.ratio.toFixed(2));
    expect(text).toContain(textPair.statusLabel);
  });

  it('states which pairs need attention and never blocks saving', () => {
    const failing = definition({ light: { background: '#ffffff', foreground: '#bbbbbb' } });
    const panel = GuidedAppearancePanel({
      draft: failing,
      appearance: 'light',
      onChange: vi.fn<() => void>(),
    });
    const text = collectText(panel);

    expect(text).toContain('1 pair needs attention');
    expect(text).toContain('Text on the canvas');
    expect(text).toContain('You can still save');
    expect(text).toContain('Moves the text seed');
    expect(buildContrastPairs(failing, 'light')[0]?.passes).toBe(false);
  });

  it('offers a one-click fix that raises the failing pair', () => {
    const failing = definition({ light: { background: '#ffffff', foreground: '#bbbbbb' } });
    const onChange = vi.fn<(next: ThemeDefinition) => void>();
    const elements = collectElements(
      GuidedAppearancePanel({ draft: failing, appearance: 'light', onChange }),
    );
    const fix = elements.find(
      (element) =>
        element.type === Button && propsOf(element)['aria-label'] === 'Fix Text on the canvas',
    );
    expect(fix).toBeDefined();

    const onClick = propsOf(fix!)['onClick'] as () => void;
    onClick();

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0];
    expect(buildContrastPairs(next!, 'light')[0]?.passes).toBe(true);
    expect(readTextContrast(next!.light.seeds)).toBeGreaterThanOrEqual(4.5);
  });

  it('shows no fix buttons when every pair passes', () => {
    const elements = collectElements(
      GuidedAppearancePanel({
        draft: definition(),
        appearance: 'light',
        onChange: vi.fn<() => void>(),
      }),
    );
    const fixButtons = elements.filter(
      (element) =>
        element.type === Button && String(propsOf(element)['aria-label'] ?? '').startsWith('Fix '),
    );
    expect(fixButtons).toHaveLength(0);
    expect(collectText(elements[0])).toContain('Every pair meets the 4.5:1');
  });

  it('moves the text contrast level through onChange', () => {
    const failing = definition({ light: { background: '#ffffff', foreground: '#bbbbbb' } });
    const onChange = vi.fn<(next: ThemeDefinition) => void>();
    const elements = collectElements(
      GuidedAppearancePanel({ draft: failing, appearance: 'light', onChange }),
    );

    fireSlider(sliderByLabel(elements, 'Text contrast level'), '4.5');

    const next = onChange.mock.calls[0]?.[0];
    expect(readTextContrast(next!.light.seeds)).toBeGreaterThanOrEqual(4.4);
  });

  it('disables every control and fix while saving', () => {
    const failing = definition({ light: { background: '#ffffff', foreground: '#bbbbbb' } });
    const elements = collectElements(
      GuidedAppearancePanel({
        draft: failing,
        appearance: 'light',
        onChange: vi.fn<() => void>(),
        disabled: true,
      }),
    );
    const interactive = elements.filter(
      (element) => element.type === Slider || element.type === Button,
    );

    expect(interactive.length).toBeGreaterThan(0);
    for (const element of interactive) {
      expect(propsOf(element)['disabled']).toBe(true);
    }
  });
});
