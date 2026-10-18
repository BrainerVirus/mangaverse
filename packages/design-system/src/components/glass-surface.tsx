import * as React from 'react';
import { cn } from '../lib/cn.js';
import { RefractionLayer } from './refraction-layer.js';

export type GlassLevel = 'thin' | 'regular' | 'thick' | 'stage';
export type GlassTone = 'default' | 'raised' | 'reader';
export type GlassElevation = 0 | 1 | 2 | 3 | 4;

/** DESIGN.md §2.1 — one class per tier; the only place in the app a `backdrop-filter` is set. */
export const glassLevels: Record<GlassLevel, string> = {
  thin: 'glass-thin',
  regular: 'glass-regular',
  thick: 'glass-thick',
  stage: 'glass-stage',
};

/** §2.4 — Tailwind's shadow tokens are wired onto the elevation scale in `globals.css`. */
export const glassElevations: Record<GlassElevation, string> = {
  0: '',
  1: 'shadow-sm',
  2: 'shadow-md',
  3: 'shadow-lg',
  4: 'shadow-xl',
};

/** §2.1/§2.5 — the tiers that blur imagery. The thin tier's backdrop is a known flat surface. */
export const GLASS_IMAGERY_TIERS: readonly GlassLevel[] = ['regular', 'thick', 'stage'];

/** §2.5 — blurred layers per view. No view adds a fifth. */
export const GLASS_BLUR_BUDGET = {
  reader: { resting: 1, transients: 3, sheet: 4 },
  shell: { normal: 2, palette: 4 },
} as const;

const DEFAULT_ELEVATION: Record<GlassLevel, GlassElevation> = {
  thin: 1,
  regular: 2,
  thick: 4,
  stage: 0,
};

const GlassLevelContext = React.createContext<GlassLevel | null>(null);

/** The nearest `GlassSurface` tier, or `null` above every surface. */
export function useGlassLevel(): GlassLevel | null {
  return React.use(GlassLevelContext);
}

export interface GlassSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  /** §2.1 tier. Defaults to `regular` (floating toolbars, cards that overlay imagery). */
  level?: GlassLevel;
  /** The opaque resolution when the tier cannot blur (§2.5). */
  tone?: GlassTone;
  /** §2.4 step. Defaults per tier: thin 1, regular 2, thick 4, stage 0 (the chrome casts none). */
  elevation?: GlassElevation;
  /** The §2.2 glass hairline on the refraction layer. */
  edge?: boolean;
  /** The §3.5 plate: a local fill under text that sits over imagery. */
  plate?: boolean;
}

export const GlassSurface = React.forwardRef<HTMLDivElement, GlassSurfaceProps>(
  (
    {
      level = 'regular',
      tone = 'default',
      elevation,
      edge = true,
      plate = false,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const parent = useGlassLevel();
    // §2.5: two imagery-blurring tiers never nest — the inner pass re-blurs a blurred composite.
    if (parent !== null && parent !== 'thin' && level !== 'thin') {
      throw new Error(
        `GlassSurface: ${level} glass cannot nest inside ${parent} glass. Two imagery-blurring tiers never nest (DESIGN.md §2.5).`,
      );
    }

    return (
      <div
        ref={ref}
        data-glass-tier={level}
        data-glass-tone={tone}
        className={cn(
          'relative isolate rounded-glass',
          glassLevels[level],
          glassElevations[elevation ?? DEFAULT_ELEVATION[level]],
          className,
        )}
        {...props}
      >
        <GlassLevelContext value={level}>
          {plate ? (
            <span
              aria-hidden="true"
              data-glass-plate=""
              className="glass-plate pointer-events-none absolute inset-0 -z-10"
            />
          ) : null}
          <RefractionLayer edge={edge} />
          {children}
        </GlassLevelContext>
      </div>
    );
  },
);
GlassSurface.displayName = 'GlassSurface';
