// Glass variants live outside component files, the way `button-variants.ts` does, so each component
// file only exports components. The named exports and types remain re-exported from `src/index.ts`.
import { cva } from 'class-variance-authority';

export type GlassLevel = 'thin' | 'regular' | 'thick' | 'stage';
export type GlassTone = 'default' | 'raised' | 'reader';
export type GlassElevation = 0 | 1 | 2 | 3 | 4;
export type GlassPanelPadding = 'none' | 'sm' | 'md' | 'lg';

/** DESIGN.md §2.1 — resolve one of the four fixed glass tiers. */
export const glassLevels = cva('', {
  variants: {
    level: {
      thin: 'glass-thin',
      regular: 'glass-regular',
      thick: 'glass-thick',
      stage: 'glass-stage',
    } satisfies Record<GlassLevel, string>,
  },
});

/** §2.4 — Tailwind's shadow tokens are wired onto the elevation scale in `globals.css`. */
export const glassElevations = cva('', {
  variants: {
    elevation: {
      0: '',
      1: 'shadow-sm',
      2: 'shadow-md',
      3: 'shadow-lg',
      4: 'shadow-xl',
    } satisfies Record<GlassElevation, string>,
  },
});

/** §2.1/§2.5 — the tiers that blur imagery. The thin tier's backdrop is a known flat surface. */
export const GLASS_IMAGERY_TIERS: readonly GlassLevel[] = ['regular', 'thick', 'stage'];

/** §2.5 — blurred layers per view. No view adds a fifth. */
export const GLASS_BLUR_BUDGET = {
  reader: { resting: 1, transients: 3, sheet: 4 },
  shell: { normal: 2, palette: 4 },
} as const;

/** §7.3 — panel interiors: 16px small, the 24px card interior, 32px page padding. */
export const glassPanelPadding: Record<GlassPanelPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};
