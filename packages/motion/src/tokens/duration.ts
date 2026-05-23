export const DURATION = {
  instant: 0,
  micro: 90,
  quick: 140,
  standard: 220,
  expressive: 360,
  cinematic: 520,
} as const;

export type DurationKey = keyof typeof DURATION;