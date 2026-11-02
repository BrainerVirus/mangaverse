import * as React from 'react';
import { useReducedMotion } from '../motion/index.js';
import { cn } from '../lib/cn.js';
import { useGlassProfileFallback } from '../hooks/use-glass-profile-fallback.js';
import {
  GLASS_IMAGERY_TIERS,
  glassElevations,
  glassLevels,
  type GlassElevation,
  type GlassLevel,
} from './glass-variants.js';
import { RefractionLayer, type RefractionLayerProps } from './refraction-layer.js';

const DEFAULT_ELEVATION: Record<GlassLevel, GlassElevation> = {
  thin: 1,
  regular: 2,
  thick: 4,
  stage: 0,
};

const GlassLevelContext = React.createContext<GlassLevel | null>(null);

export interface GlassSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  /** §2.1 tier. Defaults to `regular` (floating toolbars, cards that overlay imagery). */
  level?: GlassLevel;
  /** The opaque resolution when the tier cannot blur (§2.5). */
  tone?: 'default' | 'raised' | 'reader';
  /** §2.4 step. Defaults per tier: thin 1, regular 2, thick 4, stage 0 (the chrome casts none). */
  elevation?: GlassElevation;
  /** The §2.2 glass hairline on the refraction layer. */
  edge?: boolean;
  /** §2.2 — displacement is opt-in for hero surfaces; all other glass keeps layered sheen. */
  refraction?: RefractionLayerProps['variant'];
  /** The §3.5 plate: a local fill under text that sits over imagery. */
  plate?: boolean;
}

interface GlassSurfaceContentProps extends Omit<
  GlassSurfaceProps,
  'refraction' | 'level' | 'tone' | 'elevation' | 'edge' | 'plate'
> {
  level: GlassLevel;
  tone: NonNullable<GlassSurfaceProps['tone']>;
  elevation: GlassElevation | undefined;
  edge: boolean;
  plate: boolean;
  surfaceRef: React.Ref<HTMLDivElement>;
  refraction: NonNullable<GlassSurfaceProps['refraction']>;
  filterId?: string;
}

function GlassSurfaceContent({
  level,
  tone,
  elevation,
  edge,
  plate,
  refraction,
  filterId,
  className,
  style,
  children,
  surfaceRef,
  ...props
}: GlassSurfaceContentProps) {
  const usesDisplacement = refraction === 'displacement' && filterId !== undefined;

  const surface = (
    <div
      ref={surfaceRef}
      {...props}
      data-glass-tier={level}
      data-glass-tone={tone}
      data-refraction-surface={usesDisplacement ? 'displacement' : undefined}
      className={cn(
        'relative isolate rounded-glass',
        glassLevels({ level }),
        glassElevations({ elevation: elevation ?? DEFAULT_ELEVATION[level] }),
        className,
      )}
      style={style}
    >
      <GlassLevelContext value={level}>
        {plate ? (
          <span
            aria-hidden="true"
            data-glass-plate=""
            className="glass-plate pointer-events-none absolute inset-0 -z-10"
          />
        ) : null}
        <RefractionLayer
          edge={edge}
          variant={usesDisplacement ? 'displacement' : 'sheen'}
          {...(usesDisplacement ? { filterId } : {})}
        />
        {children}
      </GlassLevelContext>
    </div>
  );

  if (!usesDisplacement) return surface;
  return (
    <div
      className="contents"
      style={{ '--glass-refraction-filter': `url(#${filterId})` } as React.CSSProperties}
    >
      {surface}
    </div>
  );
}

function DisplacementGlassSurface(
  props: Omit<GlassSurfaceContentProps, 'refraction' | 'filterId'>,
) {
  const reducedMotion = useReducedMotion();
  const profileFallback = useGlassProfileFallback();
  const filterId = `glass-displacement-${React.useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const enabled = !reducedMotion && !profileFallback;

  return (
    <GlassSurfaceContent
      {...props}
      refraction={enabled ? 'displacement' : 'sheen'}
      {...(enabled ? { filterId } : {})}
    />
  );
}

/** The nearest `GlassSurface` tier, or `null` above every surface. */
export function useGlassLevel(): GlassLevel | null {
  return React.use(GlassLevelContext);
}

/** §2.1 — a tier whose backdrop is imagery, so its blur pass reads a blurred composite. */
function blursImagery(tier: GlassLevel): boolean {
  return GLASS_IMAGERY_TIERS.includes(tier);
}

export const GlassSurface = React.forwardRef<HTMLDivElement, GlassSurfaceProps>(
  (
    {
      level = 'regular',
      tone = 'default',
      elevation,
      edge = true,
      refraction = 'sheen',
      plate = false,
      className,
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const parent = useGlassLevel();
    // §2.5: two imagery-blurring tiers never nest — the inner pass re-blurs a blurred composite.
    if (parent !== null && blursImagery(parent) && blursImagery(level)) {
      throw new Error(
        `GlassSurface: ${level} glass cannot nest inside ${parent} glass. Two imagery-blurring tiers never nest (DESIGN.md §2.5).`,
      );
    }

    const surfaceProps = {
      ...props,
      level,
      tone,
      elevation,
      edge,
      plate,
      className,
      style,
      children,
      surfaceRef: ref,
    };

    return refraction === 'displacement' ? (
      <DisplacementGlassSurface {...surfaceProps} />
    ) : (
      <GlassSurfaceContent {...surfaceProps} refraction="sheen" />
    );
  },
);
GlassSurface.displayName = 'GlassSurface';
