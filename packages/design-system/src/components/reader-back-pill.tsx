import * as React from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { GlassSurface } from './glass-surface.js';
import { Tooltip } from './ui/tooltip.js';

export interface ReaderBackPillProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'aria-label' | 'className'
> {
  /** What is being read, such as "Kuro no Shoukanshi · Ch. 1"; truncated when long. */
  label?: string | undefined;
  /** `round` is the chevron alone: the exit while the reader chrome is hidden. */
  variant?: 'pill' | 'round';
}

/**
 * The reader's way out: a glass back pill with a chevron and what is being read, or a round
 * glass back button when the chrome is hidden. The pill's name starts with its visible text and
 * ends with what it does ("Kuro no Shoukanshi · Ch. 1, close reader"), so saying what is on screen
 * operates it (WCAG 2.5.3); the round button, with nothing to read, is "Close reader". Both hint
 * at Esc in a tooltip that opens to the right, beside the pill's own row, never over the controls
 * below it. One 40px control height wherever it sits, so the pending header, the chrome and the
 * hidden-chrome exit put it in the same place. Always the dark glass: it floats over pages and the
 * stage, whatever their colour.
 */
const ReaderBackPill = React.forwardRef<HTMLButtonElement, ReaderBackPillProps>(
  ({ label, variant = 'pill', ...props }, ref) => {
    const round = variant === 'round' || label === undefined || label === '';
    return (
      <Tooltip
        content="Close reader (Esc)"
        className={round ? 'dark shrink-0' : 'dark min-w-0 max-w-md'}
      >
        <GlassSurface level="thin" plate className="flex min-w-0 rounded-full">
          <button
            ref={ref}
            type="button"
            {...props}
            aria-label={round ? 'Close reader' : `${label}, close reader`}
            data-variant={round ? 'round' : 'pill'}
            className={cn(
              'flex h-10 min-w-0 items-center rounded-full text-sm font-medium text-stage-foreground outline-none transition-colors hover:bg-glass-plate focus-visible:bg-glass-plate focus-visible:ring-2 focus-visible:ring-ring',
              round ? 'w-10 justify-center' : 'gap-1 pr-4 pl-2.5',
            )}
          >
            <ChevronLeft className="size-5 shrink-0" aria-hidden="true" />
            {round ? null : <span className="min-w-0 truncate">{label}</span>}
          </button>
        </GlassSurface>
      </Tooltip>
    );
  },
);
ReaderBackPill.displayName = 'ReaderBackPill';

export { ReaderBackPill };
