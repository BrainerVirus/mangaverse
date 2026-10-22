import * as React from 'react';
import { cn } from '@design-system/lib/cn.js';

type SliderStyle = React.CSSProperties & { '--slider-fill'?: string };

/** The filled length of the shared track, clamped so a bad min/max can never paint past the track. */
function fillPercent(
  value: React.InputHTMLAttributes<HTMLInputElement>['value'],
  min: React.InputHTMLAttributes<HTMLInputElement>['min'],
  max: React.InputHTMLAttributes<HTMLInputElement>['max'],
): number {
  const numericMin = Number(min ?? 0);
  const numericMax = Number(max ?? 100);
  const numericValue = Number(value ?? numericMin);
  if (!Number.isFinite(numericMin) || !Number.isFinite(numericMax) || numericMax <= numericMin) {
    return 0;
  }
  return Math.min(
    100,
    Math.max(0, ((numericValue - numericMin) / (numericMax - numericMin)) * 100),
  );
}

const Slider = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, style, value, min, max, ...props }, ref) => (
    <input
      type="range"
      ref={ref}
      value={value}
      min={min}
      max={max}
      style={{ '--slider-fill': `${fillPercent(value, min, max)}%`, ...style } as SliderStyle}
      className={cn('slider-track w-full cursor-pointer appearance-none bg-transparent', className)}
      {...props}
    />
  ),
);
Slider.displayName = 'Slider';

export { Slider };
