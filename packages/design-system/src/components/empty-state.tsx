import * as React from 'react';
import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { fadeIn } from '@app/motion';
import { useReducedMotion } from '@app/motion';
import { BookX, Database, Search, ChevronRight, Archive } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { Button } from './ui/button.js';

type EmptyStateType = 'no-library' | 'no-provider' | 'no-results' | 'no-chapters' | 'no-backups';

export interface EmptyStateProps {
  type: EmptyStateType;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const emptyStateConfig: Record<
  EmptyStateType,
  { icon: React.ReactNode; title: string; description: string }
> = {
  'no-library': {
    icon: <BookX className="h-12 w-12 text-muted-foreground" />,
    title: 'Your library is empty',
    description: 'Start by adding manga to your library from a provider.',
  },
  'no-provider': {
    icon: <Database className="h-12 w-12 text-muted-foreground" />,
    title: 'No provider installed',
    description: 'Install a provider to start discovering and reading manga.',
  },
  'no-results': {
    icon: <Search className="h-12 w-12 text-muted-foreground" />,
    title: 'No results found',
    description: 'Try adjusting your search or browse for different content.',
  },
  'no-chapters': {
    icon: <ChevronRight className="h-12 w-12 text-muted-foreground" />,
    title: 'No chapters available',
    description: 'This manga doesn\'t have any chapters from this provider yet.',
  },
  'no-backups': {
    icon: <Archive className="h-12 w-12 text-muted-foreground" />,
    title: 'No backups found',
    description: 'Create a backup to restore your library and settings later.',
  },
};

export function EmptyState({ type, action }: EmptyStateProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const config = emptyStateConfig[type];

  useGSAP(
    () => {
      if (!ref.current) return;
      fadeIn(ref.current, { reducedMotion });
    },
    { scope: ref, dependencies: [reducedMotion, type] },
  );

  return (
    <div
      ref={ref}
      className={cn('flex flex-col items-center justify-center p-8 text-center')}
      style={{ opacity: reducedMotion ? 1 : 0 }}
    >
      <div className="mb-4 opacity-50">{config.icon}</div>
      <h3 className="text-lg font-semibold text-foreground">{config.title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{config.description}</p>
      {action && (
        <Button onClick={action.onClick} className="mt-6" variant="default">
          {action.label}
        </Button>
      )}
    </div>
  );
}