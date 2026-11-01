import { createEventLog } from '@/features/diagnostics/index.js';
import { sanitizeLogMessage } from '@app/shared';

/**
 * The one local event log for this app session.
 *
 * It is module-scoped on purpose: the query and mutation caches (spec F3) must
 * record into the same log Diagnostics reads, and every write must stay
 * on-device. The shared redactor is injected so the log package owns no
 * redaction policy of its own.
 */
export const eventLog = createEventLog({ redact: sanitizeLogMessage });
