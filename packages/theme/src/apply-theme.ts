import type { ThemeSettings } from '@app/shared';

import { resolveThemeAppearance, resolveThemeTokens } from './resolve-theme.js';

const CSS_VAR_KEYS = [
  '--background',
  '--foreground',
  '--muted',
  '--muted-foreground',
  '--popover',
  '--popover-foreground',
  '--card',
  '--card-foreground',
  '--border',
  '--input',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-glass',
  '--destructive-foreground',
  '--success',
  '--success-glass',
  '--warning',
  '--warning-glass',
  '--ring',
  '--reader-background',
  '--sidebar',
  '--sidebar-foreground',
  '--sidebar-border',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
] as const;

/**
 * A preset carries one quiet fill (`accent`) but the shell paints three roles with it.
 * Blending the accent toward the preset's foreground keeps the secondary fill, the
 * sidebar chip and the hover fill distinguishable, and `--accent-foreground` readable
 * on all three. Values chosen so the closest pair still clears ΔE 12 (sRGB).
 */
const SECONDARY_MIX = 0.12;
const SIDEBAR_ACCENT_MIX = 0.24;

type Rgb = readonly [number, number, number];

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const OKLCH_COLOR = /^oklch\(\s*([0-9.]+)(%?)\s+([0-9.]+)\s+([0-9.]+)\s*\)$/i;

function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** OKLCH → sRGB, channels clamped to 0–1 (Björn Ottosson's OKLab matrices). */
function oklchToRgb(lightness: number, chroma: number, hue: number): Rgb {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const red = linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);

  return [
    Math.min(1, Math.max(0, red)),
    Math.min(1, Math.max(0, green)),
    Math.min(1, Math.max(0, blue)),
  ];
}

function rgbToOklch(rgb: Rgb): readonly [number, number, number] {
  const [r = 0, g = 0, b = 0] = rgb.map(srgbToLinear);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  const lightness = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const chroma = Math.hypot(a, b2);
  const hue = ((Math.atan2(b2, a) * 180) / Math.PI + 360) % 360;
  return [lightness, chroma, chroma < 0.0005 ? 0 : hue];
}

/** Parses the notations the presets use: `#rgb`, `#rrggbb` and `oklch(L C H)`; returns sRGB 0–1. */
export function parseCssColor(value: string): Rgb | null {
  const hex = HEX_COLOR.exec(value);
  if (hex !== null) {
    const digits = hex[1] ?? '';
    const expanded =
      digits.length === 3
        ? digits
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : digits;
    return [
      Number.parseInt(expanded.slice(0, 2), 16) / 255,
      Number.parseInt(expanded.slice(2, 4), 16) / 255,
      Number.parseInt(expanded.slice(4, 6), 16) / 255,
    ];
  }

  const oklch = OKLCH_COLOR.exec(value);
  if (oklch === null) {
    return null;
  }
  const lightness = Number.parseFloat(oklch[1] ?? '') / (oklch[2] === '%' ? 100 : 1);
  return oklchToRgb(
    lightness,
    Number.parseFloat(oklch[3] ?? ''),
    Number.parseFloat(oklch[4] ?? ''),
  );
}

function formatOklch(rgb: Rgb): string {
  const [lightness, chroma, hue] = rgbToOklch(rgb);
  const trim = (value: number) => Number(value.toFixed(5));
  return `oklch(${trim(lightness)} ${trim(chroma)} ${trim(hue)})`;
}

/**
 * Mixes `from` toward `toward` by `amount` (0–1); anything unparseable is returned as is.
 * Hex sources keep their exact historical 8-bit result; oklch sources stay oklch.
 */
function mixColor(from: string, toward: string, amount: number): string {
  const source = parseCssColor(from);
  const target = parseCssColor(toward);
  if (source === null || target === null) {
    return from;
  }

  const mixed: Rgb = [
    source[0] + (target[0] - source[0]) * amount,
    source[1] + (target[1] - source[1]) * amount,
    source[2] + (target[2] - source[2]) * amount,
  ];
  if (OKLCH_COLOR.test(from)) {
    return formatOklch(mixed);
  }

  return `#${mixed
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function buildThemeCssVariables(settings: ThemeSettings): Record<string, string> {
  const tokens = resolveThemeTokens(settings);
  const appearance = resolveThemeAppearance(settings);

  const primaryForeground = appearance === 'dark' ? tokens.background : '#fafafa';
  const accentForeground = tokens.foreground;
  const muted = tokens.accent;
  const mutedForeground = appearance === 'dark' ? '#a1a1aa' : '#71717a';
  const secondary = mixColor(tokens.accent, tokens.foreground, SECONDARY_MIX);
  const sidebarAccent = mixColor(tokens.accent, tokens.foreground, SIDEBAR_ACCENT_MIX);

  return {
    '--background': tokens.background,
    '--foreground': tokens.foreground,
    '--muted': muted,
    '--muted-foreground': mutedForeground,
    '--popover': tokens.surface,
    '--popover-foreground': tokens.foreground,
    '--card': tokens.surface,
    '--card-foreground': tokens.foreground,
    '--border': tokens.border,
    '--input': tokens.border,
    '--primary': tokens.primary,
    '--primary-foreground': primaryForeground,
    '--secondary': secondary,
    '--secondary-foreground': accentForeground,
    '--accent': tokens.accent,
    '--accent-foreground': accentForeground,
    '--destructive': tokens.destructive,
    '--destructive-glass': tokens.destructiveGlass,
    '--destructive-foreground': '#fafafa',
    '--success': tokens.success,
    '--success-glass': tokens.successGlass,
    '--warning': tokens.warning,
    '--warning-glass': tokens.warningGlass,
    '--ring': tokens.primary,
    '--reader-background': tokens.readerBackground,
    '--sidebar': tokens.surface,
    '--sidebar-foreground': tokens.foreground,
    '--sidebar-border': tokens.border,
    '--sidebar-accent': sidebarAccent,
    '--sidebar-accent-foreground': accentForeground,
  };
}

export function applyThemeToRoot(root: HTMLElement, settings: ThemeSettings): void {
  const appearance = resolveThemeAppearance(settings);
  const cssVariables = buildThemeCssVariables(settings);

  root.classList.remove('light', 'dark');
  root.classList.add(appearance);

  for (const key of CSS_VAR_KEYS) {
    root.style.setProperty(key, cssVariables[key] ?? '');
  }
}

export function clearAppliedTheme(root: HTMLElement): void {
  for (const key of CSS_VAR_KEYS) {
    root.style.removeProperty(key);
  }
}
