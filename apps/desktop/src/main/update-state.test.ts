import { describe, expect, it } from 'vitest';
import type { PlatformUpdateState } from '@app/platform';
import { createUpdateState, safeUpdateMessage } from './update-state.js';

function setup(options: { enabled?: boolean } = {}) {
  const published: PlatformUpdateState[] = [];
  const machine = createUpdateState({
    enabled: options.enabled ?? true,
    currentVersion: '0.0.4-nightly.20261108.1',
    now: () => new Date('2026-11-09T12:00:00.000Z'),
    publish: (state) => published.push(state),
  });
  return { machine, published, phases: () => published.map((state) => state.phase.kind) };
}

describe('createUpdateState', () => {
  it('Given a fresh start, Then it is idle with the current version and no check yet', () => {
    const { machine, published } = setup();
    expect(machine.get()).toEqual({
      enabled: true,
      currentVersion: '0.0.4-nightly.20261108.1',
      lastCheckedAt: null,
      phase: { kind: 'idle' },
    });
    expect(published).toEqual([]);
  });

  it('Given a check that finds a release, Then it goes checking, downloading, ready and installing', () => {
    const { machine, phases } = setup();
    expect(machine.startCheck()).toBe(true);
    machine.found('0.0.4-nightly.20261109.2');
    machine.ready('0.0.4-nightly.20261109.2');
    machine.finishCheck();
    machine.installing();
    expect(phases()).toEqual(['checking', 'downloading', 'ready', 'ready', 'installing']);
    expect(machine.get().phase).toEqual({
      kind: 'installing',
      version: '0.0.4-nightly.20261109.2',
    });
    expect(machine.get().lastCheckedAt).toBe('2026-11-09T12:00:00.000Z');
  });

  it('Given a check that finds nothing, When it ends, Then it returns to idle and records the time', () => {
    const { machine } = setup();
    machine.startCheck();
    machine.finishCheck();
    expect(machine.get().phase).toEqual({ kind: 'idle' });
    expect(machine.get().lastCheckedAt).toBe('2026-11-09T12:00:00.000Z');
  });

  it.each([
    ['downloading', (m: ReturnType<typeof setup>['machine']) => m.found('1.0.1')],
    ['ready', (m: ReturnType<typeof setup>['machine']) => m.ready('1.0.1')],
    ['checking', (m: ReturnType<typeof setup>['machine']) => void m.startCheck()],
  ])(
    'Given an update that is %s, When another check starts, Then it is refused',
    (_name, enter) => {
      const { machine, published } = setup();
      enter(machine);
      const before = published.length;
      expect(machine.startCheck()).toBe(false);
      expect(published).toHaveLength(before);
    },
  );

  it('Given an error, When the next check starts, Then it is allowed again', () => {
    const { machine } = setup();
    machine.failed(new Error('GitHub returned 503'));
    expect(machine.startCheck()).toBe(true);
  });

  it('Given a build that cannot update, Then no check ever starts', () => {
    const { machine, published } = setup({ enabled: false });
    expect(machine.startCheck()).toBe(false);
    expect(published).toEqual([]);
  });

  it('Given progress that changes by fractions, Then it publishes once per whole percent', () => {
    const { machine, published } = setup();
    machine.found('1.0.1');
    const before = published.length;
    for (const percent of [10.1, 10.6, 10.99, 11, 11.4, 12.2]) {
      machine.progress({ percent, transferred: Math.round(percent * 100), total: 10_000 });
    }
    const phases = published.slice(before).map((state) => state.phase);
    expect(phases.map((phase) => (phase.kind === 'downloading' ? phase.percent : -1))).toEqual([
      10, 11, 12,
    ]);
  });

  it('Given progress outside 0-100 or after the download ended, Then it is clamped or ignored', () => {
    const { machine, published } = setup();
    machine.progress({ percent: 50, transferred: 1, total: 2 });
    expect(published).toEqual([]);
    machine.found('1.0.1');
    machine.progress({ percent: 250, transferred: 2, total: 2 });
    expect(machine.get().phase).toMatchObject({ kind: 'downloading', percent: 100 });
    machine.ready('1.0.1');
    const before = published.length;
    machine.progress({ percent: 30, transferred: 1, total: 2 });
    expect(published).toHaveLength(before);
  });

  it('Given nothing is ready, When installing is requested, Then the phase does not change', () => {
    const { machine, published } = setup();
    machine.installing();
    expect(published).toEqual([]);
  });

  it('Given a failure after a check, When the check ends, Then the error stays visible', () => {
    const { machine } = setup();
    machine.startCheck();
    machine.failed(new Error('GitHub returned 503'));
    machine.finishCheck();
    expect(machine.get().phase).toEqual({ kind: 'error', message: 'GitHub returned 503' });
  });
});

describe('safeUpdateMessage', () => {
  it.each([
    'GitHub returned 503',
    'GitHub returned 404 for MangaVerse-0.0.4-nightly.20261109.2-arm64.zip',
    'download stalled',
    'checksum mismatch for MangaVerse-0.0.4-nightly.20261109.2-arm64.zip',
    'SHA256SUMS has no entry for MangaVerse-0.0.4-nightly.20261109.2-x64.zip',
  ])('Given our own message %j, Then it is shown as is', (message) => {
    expect(safeUpdateMessage(new Error(message))).toBe(message);
  });

  it.each([
    "ENOENT: no such file or directory, open '/Users/someone/Library/secret'",
    'update helper missing: /Applications/MangaVerse.app/Contents/Resources/install/install.sh',
    'GitHub returned 503 for https://example.com/a?token=abc',
    'checksum mismatch for ../../etc/passwd',
    'connect ECONNREFUSED 127.0.0.1:443',
  ])('Given a raw message %j, Then the renderer gets the generic line instead', (message) => {
    const safe = safeUpdateMessage(new Error(message));
    expect(safe).toBe('The update could not be completed. Try again later.');
  });

  it('Given a thrown non-error, Then it is generic too', () => {
    expect(safeUpdateMessage('boom /private/path')).toBe(
      'The update could not be completed. Try again later.',
    );
  });
});
