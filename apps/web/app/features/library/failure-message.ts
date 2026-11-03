import { classifyAppError } from '@app/shared';

/**
 * The user-safe text for a failure a library surface renders inline. A thrown
 * `Error` carries internal text, so only the classified copy reaches the page.
 */
export function userFailureMessage(error: unknown, fallbackMessage: string): string {
  return classifyAppError(error, { online: globalThis.navigator.onLine, fallbackMessage }).message;
}
