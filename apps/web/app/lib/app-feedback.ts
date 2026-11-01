import { notify } from '@app/design-system';
import { classifyAppError } from '@app/shared';

import { eventLog } from './event-log.js';
import { createFeedback } from './feedback.js';

/** The session's one feedback pipeline, shared by the query caches and the router. */
export const feedback = createFeedback({
  record: (event) => void eventLog.record(event),
  notify,
  pathname: () => globalThis.location.pathname,
  isOnline: () => globalThis.navigator.onLine,
});

/** The user-safe text for a failure a route renders itself. Never the raw message. */
export function failureMessage(error: unknown, fallbackMessage?: string): string {
  return classifyAppError(error, {
    online: globalThis.navigator.onLine,
    ...(fallbackMessage === undefined ? {} : { fallbackMessage }),
  }).message;
}

/**
 * For an action whose failure may be an `AppError` from a result, whose message
 * is written for users by contract. A thrown `Error` is internal text.
 */
export function actionFailureMessage(error: unknown, fallbackMessage: string): string {
  if (typeof error === 'object' && error !== null && !(error instanceof Error)) {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (typeof code === 'string' && typeof message === 'string') return message;
  }
  return failureMessage(error, fallbackMessage);
}
