export type ReaderStageTone = 'light' | 'dark';

/** From this relative luminance a stage is light: dark ink reads on it, white ink would not. */
const LIGHT_STAGE_LUMINANCE = 0.4;

function channel(hex: string): number {
  const value = Number.parseInt(hex, 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * Whether the reader's background colour (its own setting, any `#rgb` or
 * `#rrggbb`) is light or dark, so ink drawn on the stage itself can follow it.
 * Anything unreadable is the default black stage.
 */
export function readerStageTone(backgroundColor: string): ReaderStageTone {
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(backgroundColor.trim());
  if (match === null) return 'dark';
  const digits = match[1]!;
  const full = digits.length === 3 ? digits.replaceAll(/./g, (digit) => digit + digit) : digits;
  const luminance =
    0.2126 * channel(full.slice(0, 2)) +
    0.7152 * channel(full.slice(2, 4)) +
    0.0722 * channel(full.slice(4, 6));
  return luminance >= LIGHT_STAGE_LUMINANCE ? 'light' : 'dark';
}
