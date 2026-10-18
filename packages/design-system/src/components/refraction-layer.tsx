import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface RefractionLayerProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * §2.2 — refraction is layered light. The displacement variant is an opt-in hero effect
   * (two surfaces, gated by §2.5) and is not shipped in P1.
   */
  variant?: 'sheen';
  /** The §2.2 hairline: a 1px `--glass-edge` border that replaces `--border` on glass. */
  edge?: boolean;
}

/**
 * The decorative light layer of a glass surface: sheen, 1px specular edge, inner bottom shadow
 * and the glass hairline. Always `aria-hidden` and never interactive.
 */
export const RefractionLayer = React.forwardRef<HTMLDivElement, RefractionLayerProps>(
  ({ variant = 'sheen', edge = true, className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      data-refraction={variant}
      className={cn('glass-refraction', edge && 'glass-refraction-edge', className)}
      {...props}
    />
  ),
);
RefractionLayer.displayName = 'RefractionLayer';
