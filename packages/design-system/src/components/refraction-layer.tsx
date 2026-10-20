import * as React from 'react';
import { useReducedMotion } from '@app/motion';
import { cn } from '../lib/cn.js';
import { useGlassProfileFallback } from '../hooks/use-glass-profile-fallback.js';

export interface RefractionLayerProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * §2.2 — layered light is the default; displacement is opt-in on hero surfaces only (§2.5).
   */
  variant?: 'sheen' | 'displacement';
  /** The §2.2 hairline: a 1px `--glass-edge` border that replaces `--border` on glass. */
  edge?: boolean;
}

interface DisplacementLayerProps extends Omit<RefractionLayerProps, 'variant'> {
  edge: boolean;
}

const DisplacementLayer = React.forwardRef<HTMLDivElement, DisplacementLayerProps>(
  ({ edge, className, style, ...props }, ref) => {
    const reducedMotion = useReducedMotion();
    const disabled = useGlassProfileFallback();
    const filterId = `glass-displacement-${React.useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

    if (reducedMotion || disabled) {
      return (
        <div
          ref={ref}
          {...props}
          aria-hidden="true"
          data-refraction="sheen"
          className={cn('glass-refraction', edge && 'glass-refraction-edge', className)}
          style={style}
        />
      );
    }

    const filterStyle = {
      ...style,
      '--glass-refraction-filter': `url(#${filterId})`,
    } as React.CSSProperties;

    return (
      <div
        ref={ref}
        {...props}
        aria-hidden="true"
        data-refraction="displacement"
        className={cn(
          'glass-refraction',
          edge && 'glass-refraction-edge',
          'glass-refraction-displacement',
          className,
        )}
        style={filterStyle}
      >
        <svg width="0" height="0" aria-hidden="true" focusable="false">
          <defs>
            <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.012"
                numOctaves="2"
                seed="4"
                result="glassNoise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="glassNoise"
                scale="6"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>
      </div>
    );
  },
);

/**
 * The decorative light layer of a glass surface: sheen, 1px specular edge, inner bottom shadow
 * and the glass hairline. Always `aria-hidden` and never interactive.
 */
export const RefractionLayer = React.forwardRef<HTMLDivElement, RefractionLayerProps>(
  ({ variant = 'sheen', edge = true, className, ...props }, ref) =>
    variant === 'displacement' ? (
      <DisplacementLayer ref={ref} edge={edge} className={className} {...props} />
    ) : (
      <div
        ref={ref}
        {...props}
        aria-hidden="true"
        data-refraction="sheen"
        className={cn('glass-refraction', edge && 'glass-refraction-edge', className)}
      />
    ),
);
RefractionLayer.displayName = 'RefractionLayer';
