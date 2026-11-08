import * as React from 'react';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { useStateReducer } from '../hooks/use-state-reducer.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.js';

export interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  collapsed?: boolean;
  danger?: boolean;
}

interface SectionState {
  readonly isOpen: boolean;
  /** Once opened the body stays mounted, so closing can ease the height down instead of cutting. */
  readonly hasOpened: boolean;
}

/** The only event is a toggle; the reducer needs no payload. */
function sectionReducer(state: SectionState, _toggle: 'toggle'): SectionState {
  return { isOpen: !state.isOpen, hasOpened: true };
}

export function SettingsSection({
  title,
  description,
  children,
  collapsed = false,
  danger = false,
}: SettingsSectionProps) {
  const [{ isOpen, hasOpened }, dispatch] = useStateReducer(sectionReducer, {
    isOpen: !collapsed,
    hasOpened: !collapsed,
  });

  return (
    <Card className={cn('w-full', danger && 'border-destructive/40')}>
      <CardHeader className="pb-4">
        <button
          type="button"
          onClick={() => dispatch('toggle')}
          className={cn(
            'flex w-full items-center justify-between text-left',
            'rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
          aria-expanded={isOpen}
        >
          <div className="flex items-center gap-2">
            {danger ? <AlertTriangle className="size-4 text-destructive" /> : null}
            <CardTitle size="heading" className={cn(danger && 'text-destructive')}>
              {title}
            </CardTitle>
          </div>
          {collapsed ? (
            <ChevronDown
              aria-hidden
              className={cn(
                'size-4 transition-transform duration-200 motion-reduce:transition-none',
                !isOpen && '-rotate-90',
              )}
            />
          ) : null}
        </button>
        {description && isOpen ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>

      {collapsed ? (
        hasOpened ? (
          <div className="collapsible-grid" data-open={isOpen}>
            <div className="min-h-0 overflow-hidden" inert={!isOpen}>
              <CardContent className="pt-0">{children}</CardContent>
            </div>
          </div>
        ) : null
      ) : isOpen ? (
        // A section that is not collapsible keeps its original behaviour: its body renders in
        // plain flow and the header still folds it, with no clipping wrapper and nothing that
        // could ease in from zero height when the page loads.
        <CardContent className="pt-0">{children}</CardContent>
      ) : null}
    </Card>
  );
}
