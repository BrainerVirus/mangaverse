import * as React from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { GlassSurface } from './glass-surface.js';

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
 * glass back button when the chrome is hidden. The pill's name is its visible text alone
 * ("Kuro no Shoukanshi · Ch. 1", WCAG 2.5.3) and its description says what it does ("Closes the
 * reader"); the round button, with nothing to read, is named "Close reader". One 40px
 * control height wherever it sits, so the pending header, the chrome and the hidden-chrome exit
 * put it in the same place. Always the dark glass: it floats over pages and the stage, whatever
 * their colour.
 */
const ReaderBackPill = React.forwardRef<HTMLButtonElement, ReaderBackPillProps>(
  ({ label, variant = 'pill', ...props }, ref) => {
    const round = variant === 'round' || label === undefined || label === '';
    const descriptionId = React.useId();
    return (
      <GlassSurface
        level="thin"
        plate
        className={cn('dark flex rounded-full', round ? 'shrink-0' : 'min-w-0 max-w-md')}
      >
        <button
          ref={ref}
          type="button"
          {...props}
          aria-label={round ? 'Close reader' : undefined}
          aria-describedby={round ? undefined : descriptionId}
          data-variant={round ? 'round' : 'pill'}
          className={cn(
            'flex h-10 min-w-0 items-center rounded-full text-sm font-medium text-stage-foreground outline-none transition-colors hover:bg-glass-plate focus-visible:bg-glass-plate focus-visible:ring-2 focus-visible:ring-ring',
            round ? 'w-10 justify-center' : 'gap-1 pr-4 pl-2.5',
          )}
        >
          <ChevronLeft className="size-5 shrink-0" aria-hidden="true" />
          {round ? null : <span className="min-w-0 truncate">{label}</span>}
        </button>
        {round ? null : (
          <span id={descriptionId} className="sr-only">
            Closes the reader
          </span>
        )}
      </GlassSurface>
    );
  },
);
ReaderBackPill.displayName = 'ReaderBackPill';

export { ReaderBackPill };
