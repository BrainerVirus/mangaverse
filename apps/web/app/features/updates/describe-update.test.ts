// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PlatformUpdateState } from '@app/platform';

import {
  canCheckForUpdates,
  describeUpdate,
  formatLastChecked,
  updateChannel,
} from './describe-update.js';

const base: PlatformUpdateState = {
  enabled: true,
  currentVersion: '0.0.4-nightly.20261109.2',
  lastCheckedAt: null,
  phase: { kind: 'idle' },
};
const withPhase = (phase: PlatformUpdateState['phase']): PlatformUpdateState => ({
  ...base,
  phase,
});

describe('describeUpdate', () => {
  it.each([
    [base, 'No update checked yet'],
    [{ ...base, lastCheckedAt: '2026-11-09T12:00:00.000Z' }, 'You are up to date'],
    [{ ...base, enabled: false }, 'Updates are off in this build'],
    [withPhase({ kind: 'checking' }), 'Checking for updates…'],
    [
      withPhase({ kind: 'downloading', version: '1.2.0', percent: 40, transferred: 4, total: 10 }),
      'Downloading 1.2.0',
    ],
    [withPhase({ kind: 'ready', version: '1.2.0' }), '1.2.0 is ready to install'],
    [withPhase({ kind: 'installing', version: '1.2.0' }), 'Restarting to install 1.2.0'],
    [withPhase({ kind: 'error', message: 'download stalled' }), 'The update did not finish'],
  ])('Given %j, Then the title is %s', (state, title) => {
    expect(describeUpdate(state).title).toBe(title);
  });

  it('keeps the changing percent out of the title, which the page announces', () => {
    const state = withPhase({
      kind: 'downloading',
      version: '1.2.0',
      percent: 73,
      transferred: 7,
      total: 10,
    });
    expect(describeUpdate(state).title).not.toContain('73');
    expect(describeUpdate(state).detail).toContain('73%');
  });

  it('shows the error message it was given', () => {
    expect(describeUpdate(withPhase({ kind: 'error', message: 'download stalled' })).detail).toBe(
      'download stalled',
    );
  });
});

describe('canCheckForUpdates', () => {
  it.each([
    [base, true],
    [withPhase({ kind: 'error', message: 'x' }), true],
    [{ ...base, enabled: false }, false],
    [withPhase({ kind: 'checking' }), false],
    [withPhase({ kind: 'ready', version: '1' }), false],
    [withPhase({ kind: 'installing', version: '1' }), false],
  ])('Given %j, Then a check may start: %s', (state, expected) => {
    expect(canCheckForUpdates(state)).toBe(expected);
  });
});

describe('updateChannel', () => {
  it.each([
    ['0.0.4-nightly.20261109.2', 'Nightly'],
    ['1.2.0', 'Stable'],
  ])('%s is %s', (version, channel) => {
    expect(updateChannel(version)).toBe(channel);
  });
});

describe('formatLastChecked', () => {
  it('says so before the first check, and for a bad value', () => {
    expect(formatLastChecked(null)).toBe('Not checked yet');
    expect(formatLastChecked('not a date')).toBe('Not checked yet');
  });

  it('formats a real time as a date', () => {
    expect(formatLastChecked('2026-11-09T12:00:00.000Z')).toMatch(/2026/);
  });
});
