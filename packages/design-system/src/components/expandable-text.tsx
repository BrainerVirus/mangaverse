import * as React from 'react';
import { cn } from '../lib/cn.js';
import { useStateReducer } from '../hooks/use-state-reducer.js';
import { Button } from './ui/button.js';

export interface ExpandableTextProps {
  children: React.ReactNode;
  /** The collapsed height, in rem: text taller than this is clamped behind a fade. */
  collapsedRem?: number;
  moreLabel?: string;
  lessLabel?: string;
  className?: string;
}

const noop = (): void => {};

interface ExpandableState {
  readonly expanded: boolean;
  readonly content: HTMLDivElement | null;
}

type ExpandableEvent =
  | { readonly type: 'toggle' }
  | { readonly type: 'content'; readonly element: HTMLDivElement | null };

function expandableReducer(state: ExpandableState, event: ExpandableEvent): ExpandableState {
  if (event.type === 'toggle') return { ...state, expanded: !state.expanded };
  return state.content === event.element ? state : { ...state, content: event.element };
}

/**
 * The height of `element`'s content, kept current by a ResizeObserver. `useSyncExternalStore`
 * rather than an effect: the layout is an external system and the snapshot is a plain number.
 */
function useContentHeight(element: HTMLElement | null): number {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (element === null || typeof ResizeObserver === 'undefined') return noop;
      const observer = new ResizeObserver(onChange);
      observer.observe(element);
      return () => observer.disconnect();
    },
    [element],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => element?.offsetHeight ?? 0,
    () => 0,
  );
}

/**
 * Long text clamped to a standard height, the way GitLab and GitHub fold a long description:
 * the overflow fades out, and a link-style button grows the box to its full height (and folds
 * it back). Text that already fits is left alone, with no fade and no button. The box eases
 * between the collapsed height and the measured content height. Height is the one layout
 * property this animates, because the box has to grow to fit; reduced motion snaps.
 */
export function ExpandableText({
  children,
  collapsedRem = 7.5,
  moreLabel = 'Show more',
  lessLabel = 'Show less',
  className,
}: ExpandableTextProps) {
  const [{ expanded, content }, dispatch] = useStateReducer(expandableReducer, {
    expanded: false,
    content: null,
  });
  const setContent = React.useCallback(
    (element: HTMLDivElement | null) => dispatch({ type: 'content', element }),
    [dispatch],
  );
  const id = React.useId();
  const contentHeight = useContentHeight(content);
  const rootFontSize =
    typeof document === 'undefined'
      ? 16
      : Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const overflows = contentHeight > collapsedRem * rootFontSize + 1;
  const clamped = overflows && !expanded;

  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      <div
        id={id}
        data-clamped={clamped ? '' : undefined}
        className="expandable-box w-full overflow-hidden"
        style={
          {
            '--expandable-height': clamped
              ? `${collapsedRem}rem`
              : overflows
                ? `${contentHeight}px`
                : 'auto',
            '--expandable-fade': clamped ? '3rem' : '0px',
          } as React.CSSProperties
        }
      >
        <div ref={setContent}>{children}</div>
      </div>
      {overflows ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => dispatch({ type: 'toggle' })}
        >
          {expanded ? lessLabel : moreLabel}
        </Button>
      ) : null}
    </div>
  );
}
