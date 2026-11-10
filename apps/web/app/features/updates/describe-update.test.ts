// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PlatformUpdateState } from '@app/platform';

import {
  describeUpdate,
  formatLastChecked,
  titleBarUpdate,
  updateAction,
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
    [
      withPhase({ kind: 'installing', version: '1.2.0', queued: false }),
      'Restarting to install 1.2.0',
    ],
    [withPhase({ kind: 'installing', version: '1.2.0', queued: true }), 'Restart queued for 1.2.0'],
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

describe('updateAction', () => {
  it.each([
    [base, 'Check for updates', 'check'],
    [withPhase({ kind: 'error', message: 'x' }), 'Check for updates', 'check'],
    [{ ...base, enabled: false }, 'Check for updates', 'off'],
    [withPhase({ kind: 'checking' }), 'Checking…', 'busy'],
    [
      withPhase({ kind: 'downloading', version: '1', percent: 1, transferred: 1, total: 9 }),
      'Downloading…',
      'busy',
    ],
    [withPhase({ kind: 'ready', version: '1' }), 'Restart and install', 'install'],
    [withPhase({ kind: 'installing', version: '1', queued: true }), 'Restart queued', 'busy'],
    [withPhase({ kind: 'installing', version: '1', queued: false }), 'Restarting…', 'busy'],
  ])('Given %j, Then the button reads %s and is %s', (state, label, kind) => {
    expect(updateAction(state)).toEqual({ label, kind });
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

describe('titleBarUpdate', () => {
  it.each([
    [withPhase({ kind: 'idle' }), null],
    [withPhase({ kind: 'checking' }), null],
    [withPhase({ kind: 'error', message: 'Offline.' }), null],
  ])('Given nothing to install, Then the title bar shows no button', (state, expected) => {
    expect(titleBarUpdate(state)).toBe(expected);
  });

  it('Given no state yet, Then the title bar shows no button', () => {
    expect(titleBarUpdate(null)).toBeNull();
  });

  it.each([
    [
      withPhase({ kind: 'downloading', version: '1.2.0', percent: 40, transferred: 4, total: 10 }),
      'downloading',
      '40%',
      'Downloading update 1.2.0, 40%',
      40,
    ],
    [
      withPhase({ kind: 'ready', version: '1.2.0' }),
      'ready',
      'Restart to update',
      'Restart to update: 1.2.0 is ready to install',
      null,
    ],
    [
      withPhase({ kind: 'installing', version: '1.2.0', queued: true }),
      'queued',
      'Restart queued',
      'Restart queued: Restart queued for 1.2.0',
      null,
    ],
    [
      withPhase({ kind: 'installing', version: '1.2.0', queued: false }),
      'restarting',
      'Restarting…',
      'Restarting…: Restarting to install 1.2.0',
      null,
    ],
  ])(
    'Given an update in flight, Then the label is short and the name repeats it with the version',
    (state, kind, label, name, percent) => {
      expect(titleBarUpdate(state)).toEqual({ kind, label, name, percent });
    },
  );
});
