import * as React from 'react';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/cn.js';
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
    <div className={cn('surface-panel w-full p-4 md:p-5', danger && 'border-destructive/40')}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex w-full items-center justify-between py-2 text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-[var(--radius-control)]'
        )}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          {danger && <AlertTriangle className="h-4 w-4 text-destructive" />}
          <h3 className={cn('text-base font-semibold', danger && 'text-destructive')}>{title}</h3>
        </div>
        {collapsed && (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
      </button>

      {description && isOpen && (
        <p className="mb-3 text-sm text-muted-foreground">{description}</p>
      )}

      {isOpen && (
        <>
          {children}
          <Separator className="mt-4" />
        </>
      )}
    </div>
  );
}