import type { CSSProperties } from 'react';
import { toast as sonner, Toaster as SonnerToaster } from 'sonner';

/** Clears the mobile bottom nav; kept at every width so toasts never change place. */
const BOTTOM_OFFSET = 'calc(3.5rem + env(safe-area-inset-bottom) + 0.75rem)';
const SAVING_TOAST_ID = 'saving';

const SEMANTIC_TOKENS = {
  '--normal-bg': 'var(--popover)',
  '--normal-text': 'var(--popover-foreground)',
  '--normal-border': 'var(--border)',
  '--border-radius': 'var(--radius)',
} as CSSProperties;

/**
 * The app's only toast host. Sonner's stylesheet removes all motion for
 * `prefers-reduced-motion`.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      visibleToasts={3}
      offset={{ bottom: BOTTOM_OFFSET }}
      mobileOffset={{ bottom: BOTTOM_OFFSET }}
      style={SEMANTIC_TOKENS}
    />
  );
}

interface NotifyAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface NotifyFailureInput {
  /** Failures with the same key share one toast, however often they repeat. */
  readonly key: string;
  readonly message: string;
  readonly onRetry?: () => void;
  /** Replaces the retry action, for a failure whose next step is not a retry. */
  readonly action?: NotifyAction;
}

// react-doctor-disable-next-line react-doctor/only-export-components -- ruling: toast-single-module: spec F4 keeps Sonner behind one wrapper file, and no fast-refresh boundary depends on this module.
export const notify = {
  /** Sonner replaces a toast that keeps its id, which is what deduplicates. */
  failure(this: void, { key, message, onRetry, action }: NotifyFailureInput): void {
    const resolvedAction =
      action ?? (onRetry === undefined ? undefined : { label: 'Retry', onClick: onRetry });
    sonner.error(message, {
      id: `failure:${key}:${message}`,
      ...(resolvedAction === undefined ? {} : { action: resolvedAction }),
    });
  },
  success(this: void, message: string): void {
    sonner.success(message, { id: `success:${message}` });
  },
  saving(this: void): void {
    sonner.loading('Saving…', { id: SAVING_TOAST_ID });
  },
  saved(this: void): void {
    sonner.success('Saved', { id: SAVING_TOAST_ID });
  },
  dismissSaving(this: void): void {
    sonner.dismiss(SAVING_TOAST_ID);
  },
};
