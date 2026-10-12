import * as React from 'react';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.js';
import { Separator } from './ui/separator.js';

export interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  collapsed?: boolean;
  danger?: boolean;
}

export function SettingsSection({
  title,
  description,
  children,
  collapsed = false,
  danger = false,
}: SettingsSectionProps) {
  const [isOpen, setIsOpen] = React.useState(!collapsed);

  return (
    <Card className={cn('w-full', danger && 'border-destructive/40')}>
      <CardHeader className="pb-4">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'flex w-full items-center justify-between text-left',
            'rounded-[var(--radius-control)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
          )}
          aria-expanded={isOpen}
        >
          <div className="flex items-center gap-2">
            {danger ? <AlertTriangle className="h-4 w-4 text-destructive" /> : null}
            <CardTitle className={cn('text-base', danger && 'text-destructive')}>{title}</CardTitle>
          </div>
          {collapsed ? (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : null}
        </button>
        {description && isOpen ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>

      {isOpen ? (
        <CardContent className="pt-0">
          {children}
          <Separator className="mt-4" />
        </CardContent>
      ) : null}
    </Card>
  );
}
