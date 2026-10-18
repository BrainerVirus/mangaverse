import * as React from 'react';
import { cn } from '../lib/cn.js';
import {
  glassElevations,
  glassLevels,
  type GlassElevation,
  type GlassLevel,
} from './glass-variants.js';
import { RefractionLayer } from './refraction-layer.js';

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
  tone?: 'default' | 'raised' | 'reader';
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
