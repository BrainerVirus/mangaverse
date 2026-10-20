import {
  clampRgb,
  converter,
  differenceCiede2000,
  parse,
  toGamut,
  wcagContrast,
  type Color,
} from 'culori';

const toRgbColor = converter('rgb');
const toOklchColor = converter('oklch');

/** OKLCH values print with the same five-decimal trim the theme layer always used. */
const OKLCH_PRECISION = 5;

type Rgb = readonly [number, number, number];

function isOklchNotation(value: string): boolean {
  return /^\s*oklch\(/i.test(value);
}

function trimNumber(value: number): number {
  return Number(value.toFixed(OKLCH_PRECISION));
}

/** Formats an OKLCH triple the way `apply-theme` has always emitted it. */
export function formatOklch(lightness: number, chroma: number, hue: number): string {
  const safeChroma = chroma < 0.0005 ? 0 : trimNumber(chroma);
  const safeHue = safeChroma === 0 || !Number.isFinite(hue) ? 0 : trimNumber(hue);
  return `oklch(${trimNumber(lightness)} ${safeChroma} ${safeHue})`;
}

export function parseThemeColor(value: string): Color | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }
  try {
    return parse(value);
  } catch {
    return undefined;
  }
}

/** Accepts any CSS Color 4 notation culori knows and returns sRGB channels in 0–1. */
export function parseCssColor(value: string): Rgb | undefined {
  const color = parseThemeColor(value);
  if (color === undefined) {
    return undefined;
  }
  const rgb = toRgbColor(color);
  return [clampChannel(rgb.r), clampChannel(rgb.g), clampChannel(rgb.b)];
}

function clampChannel(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/** Normalizes any accepted color to the OKLCH representation stored in a definition. */
export function normalizeCssColor(value: string): string | undefined {
  const color = parseThemeColor(value);
  if (color === undefined) {
    return undefined;
  }
  const oklch = toOklchColor(color);
  return formatOklch(oklch.l, oklch.c ?? 0, oklch.h ?? 0);
}

export function isCssColor(value: string): boolean {
  return parseThemeColor(value) !== undefined;
}

/**
 * Blends `from` toward `toward` by `amount` (0–1) in gamma-encoded sRGB.
 *
 * The interpolation stays in sRGB because every built-in preset ships the bytes
 * this formula produced before the theme builder; hue-intentional colors are
 * expected to arrive as OKLCH seeds, which keep OKLCH output notation.
 */
export function mixCssColors(from: string, toward: string, amount: number): string {
  const source = parseCssColor(from);
  const target = parseCssColor(toward);
  if (source === undefined || target === undefined) {
    return from;
  }

  const mixed: Rgb = [
    source[0] + (target[0] - source[0]) * amount,
    source[1] + (target[1] - source[1]) * amount,
    source[2] + (target[2] - source[2]) * amount,
  ];
  if (isOklchNotation(from)) {
    const oklch = toOklchColor({ mode: 'rgb', r: mixed[0], g: mixed[1], b: mixed[2] });
    return formatOklch(oklch.l, oklch.c ?? 0, oklch.h ?? 0);
  }

  return `#${mixed
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** WCAG 2.1 contrast ratio, or `null` when either color is unparseable. */
export function contrastRatio(a: string, b: string): number | null {
  if (!isCssColor(a) || !isCssColor(b)) {
    return null;
  }
  return wcagContrast(a, b);
}

/** CIEDE2000 color difference, or `null` when either color is unparseable. */
export function deltaE(a: string, b: string): number | null {
  const first = parseThemeColor(a);
  const second = parseThemeColor(b);
  if (first === undefined || second === undefined) {
    return null;
  }
  return differenceCiede2000()(first, second);
}

const GAMUT_EPSILON = 1e-7;

export function isInSrgbGamut(value: string): boolean {
  const color = parseThemeColor(value);
  if (color === undefined) {
    return false;
  }
  const rgb = toRgbColor(color);
  return [rgb.r, rgb.g, rgb.b].every(
    (channel) => channel >= -GAMUT_EPSILON && channel <= 1 + GAMUT_EPSILON,
  );
}

/**
 * Maps an out-of-gamut color into sRGB with CSS Color 4's OKLCH chroma reduction.
 * Returns `undefined` for an unparseable input.
 */
export function mapToSrgbGamut(value: string): string | undefined {
  const color = parseThemeColor(value);
  if (color === undefined) {
    return undefined;
  }
  const mapped = toGamut('rgb', 'oklch')(clampRgb(color) ?? color);
  const oklch = toOklchColor(mapped);
  return formatOklch(oklch.l, oklch.c ?? 0, oklch.h ?? 0);
}

/** Returns the color with a replaced OKLCH lightness, preserving chroma and hue. */
export function withOklchLightness(value: string, lightness: number): string | undefined {
  const color = parseThemeColor(value);
  if (color === undefined) {
    return undefined;
  }
  const oklch = toOklchColor(color);
  return formatOklch(Math.min(1, Math.max(0, lightness)), oklch.c ?? 0, oklch.h ?? 0);
}

export function getOklchLightness(value: string): number | undefined {
  const color = parseThemeColor(value);
  if (color === undefined) {
    return undefined;
  }
  return toOklchColor(color).l;
}
