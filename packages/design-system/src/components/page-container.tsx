import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface PageContainerProps {
  variant?: 'wide' | 'read';
  className?: string;
  children: React.ReactNode;
}

/**
 * The one page frame: every app route's content sits in it, so a title's left edge and the
 * outer padding match across routes. `wide` is for grids and lists (library, discovery, search);
 * `read` is a narrow column for settings and forms. Both stay left-aligned (no auto margins) so
 * every title shares one left edge at any window width; on an ultrawide screen a wide grid hugs
 * the left instead of centring.
 */
export function PageContainer({ variant = 'wide', className, children }: PageContainerProps) {
  return (
    <div
      data-page-container={variant}
      className={cn(
        'w-full px-6 py-6 lg:px-8 lg:py-8',
        variant === 'wide' ? 'max-w-400' : 'max-w-3xl',
        className,
      )}
    >
      {children}
    </div>
  );
}
