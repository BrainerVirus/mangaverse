const TIMESTAMP_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * Backup metadata stores an ISO string; the page shows a local, human date
 * instead of the raw `2026-01-02T03:04:05.000Z` the file carries. An
 * unparseable value (hand-edited backup) is shown as-is rather than as
 * "Invalid Date".
 */
export function formatBackupTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : TIMESTAMP_FORMAT.format(date);
}
