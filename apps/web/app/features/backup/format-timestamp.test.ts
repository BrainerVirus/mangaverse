import { describe, expect, it } from 'vitest';
import { formatBackupTimestamp } from './format-timestamp.js';

describe('formatBackupTimestamp', () => {
  it('Given an ISO backup timestamp, Then it shows a readable local date and time', () => {
    const formatted = formatBackupTimestamp('2026-01-02T03:04:05.000Z');

    expect(formatted).not.toContain('T03:04:05');
    expect(formatted).toContain('2026');
  });

  it('Given a hand-edited timestamp that is not a date, Then it stays as written', () => {
    expect(formatBackupTimestamp('not-a-date')).toBe('not-a-date');
  });
});
