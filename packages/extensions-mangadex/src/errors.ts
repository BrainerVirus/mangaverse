import type { AppError } from '@app/shared';
import { createAppError } from '@app/shared';

export const MANGADEX_PAYLOAD_INVALID = 'extensions.mangadex.payload_invalid' as const;

/**
 * Payload shape drift is an error, never a silently empty result: callers get a
 * normalized AppError with the endpoint and the first mismatched field.
 */
export function payloadError(endpoint: string, detail: string): AppError {
  return createAppError({
    code: MANGADEX_PAYLOAD_INVALID,
    message: `Unexpected MangaDex payload for ${endpoint}: ${detail}`,
    retryable: false,
    details: { endpoint },
  });
}
