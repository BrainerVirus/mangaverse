import type { DiagnosticEventInput } from '@/features/diagnostics/index.js';
import {
  classifyAppError,
  failureLogText,
  isCancellationError,
  type ClassifiedAppError,
} from '@app/shared';

/** How long a save may run before "Saving…" appears; faster saves show nothing. */
export const SAVING_INDICATOR_DELAY_MS = 300;

/**
 * What a query or mutation wants done when it fails (spec F3). `page` and
 * `inline` mean the route already renders the failure, so only the log hears it.
 */
export interface FeedbackMeta {
  readonly surface: 'page' | 'inline' | 'toast' | 'silent';
  /** Replaces the generic copy for an unexpected failure. */
  readonly message?: string;
  /** Shows "Saving…" past the delay, then Saved, or the failure with retry. */
  readonly saving?: boolean;
  /** Toasted when the action succeeds. */
  readonly success?: string;
}

/** The meta of a user's save: "Saving…" when slow, a toast with retry when it fails. */
export function saveFeedback(
  message: string,
  success?: string,
): { readonly feedback: FeedbackMeta } {
  return {
    feedback: {
      surface: 'toast',
      message,
      saving: true,
      ...(success === undefined ? {} : { success }),
    },
  };
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { readonly feedback?: FeedbackMeta };
    mutationMeta: { readonly feedback?: FeedbackMeta };
  }
}

export interface FeedbackDeps {
  readonly record: (event: DiagnosticEventInput) => void;
  readonly notify: {
    failure(input: { key: string; message: string; onRetry?: () => void }): void;
    success(message: string): void;
    saving(): void;
    saved(): void;
    dismissSaving(): void;
  };
  readonly pathname: () => string;
  readonly isOnline: () => boolean;
}

interface FailureInput {
  readonly source: string;
  readonly feedback: FeedbackMeta | undefined;
  /** Cached data is still on screen, so nothing is wrong from the user's side. */
  readonly hasCachedData?: boolean;
  readonly onRetry?: () => void;
}

export interface Feedback {
  /** Classifies and logs without showing anything, for failures caught elsewhere. */
  log(error: unknown, source: string): void;
  onFailure(error: unknown, input: FailureInput): void;
  onSaveStart(saveId: number): void;
  onSaveEnd(saveId: number, outcome: 'saved' | 'failed'): void;
  onSuccess(message: string): void;
}

export function createFeedback(deps: FeedbackDeps): Feedback {
  const pendingSaves = new Map<number, ReturnType<typeof setTimeout>>();
  let savingShown = false;

  const isReading = () => deps.pathname().startsWith('/reader/');

  function classify(error: unknown, message: string | undefined): ClassifiedAppError {
    return classifyAppError(error, {
      online: deps.isOnline(),
      ...(message === undefined ? {} : { fallbackMessage: message }),
    });
  }

  function record(failure: ClassifiedAppError, source: string): void {
    deps.record({
      kind: 'error',
      code: failure.code,
      message: `${source}: ${failureLogText(failure)}`,
      ...(failure.providerId === undefined ? {} : { providerId: failure.providerId }),
    });
  }

  return {
    log(error, source) {
      if (!isCancellationError(error)) record(classify(error, undefined), source);
    },
    onFailure(error, { source, feedback, hasCachedData = false, onRetry }) {
      if (isCancellationError(error)) return;
      const failure = classify(error, feedback?.message);
      record(failure, source);
      // The reader reports what stops reading on its own surface; a toast over
      // the page would only interrupt.
      if (feedback?.surface !== 'toast' || hasCachedData || isReading()) return;
      deps.notify.failure({
        key: failure.code,
        message: failure.message,
        ...(failure.retryable && onRetry !== undefined ? { onRetry } : {}),
      });
    },
    onSaveStart(saveId) {
      const timer = setTimeout(() => {
        if (savingShown || isReading()) return;
        savingShown = true;
        deps.notify.saving();
      }, SAVING_INDICATOR_DELAY_MS);
      pendingSaves.set(saveId, timer);
    },
    onSaveEnd(saveId, outcome) {
      clearTimeout(pendingSaves.get(saveId));
      pendingSaves.delete(saveId);
      if (!savingShown) return;
      // Another save is still running, so "Saving…" stays true.
      if (pendingSaves.size > 0) return;
      savingShown = false;
      // A failure has its own toast, which carries the retry.
      if (outcome === 'failed') deps.notify.dismissSaving();
      else deps.notify.saved();
    },
    onSuccess(message) {
      if (!isReading()) deps.notify.success(message);
    },
  };
}
