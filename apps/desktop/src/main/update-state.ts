/**
 * The update state the renderer shows (the title-bar button, its progress window, settings).
 *
 * Pure transitions, so every rule is testable without Electron or the network. A release downloads
 * on its own once found, so there is no separate "available": it is `downloading` from 0%. Every
 * change is published; progress is published only when the whole percent changes, because
 * electron-updater reports far more often than a progress bar can show.
 */
import type { PlatformUpdateState } from '@app/platform';
import type { UpdateProgress } from './updater.js';

export interface UpdateStateMachine {
  get(): PlatformUpdateState;
  /** Begins a check unless an update is already downloading, ready or installing. */
  startCheck(): boolean;
  /** A newer release was found and its download is starting. */
  found(version: string): void;
  progress(progress: UpdateProgress): void;
  ready(version: string): void;
  /** The install was accepted; `queued` while a chapter is open and the restart must wait. */
  installing(queued: boolean): void;
  failed(error: unknown): void;
  /** The check ended: records the time, and falls back to idle if nothing was found. */
  finishCheck(): void;
}

export interface UpdateStateOptions {
  readonly enabled: boolean;
  readonly currentVersion: string;
  readonly publish: (state: PlatformUpdateState) => void;
  readonly now?: () => Date;
}

/** The messages our own updaters produce for the common failures: short, and with no path or URL. */
const SAFE_ERRORS = [
  /^GitHub returned \d{3}( for [\w.+-]+)?$/,
  /^download stalled$/,
  /^checksum mismatch for [\w.+-]+$/,
  /^SHA256SUMS has no entry for [\w.+-]+$/,
] as const;
const GENERIC_ERROR = 'The update could not be completed. Try again later.';

/**
 * What the renderer may see of a failure: one of the exact messages above, else a generic line.
 * Anything else (an ENOENT with a path, a URL, a stack, electron-updater's own text) stays in main's log.
 */
export function safeUpdateMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return SAFE_ERRORS.some((pattern) => pattern.test(message)) ? message : GENERIC_ERROR;
}

export function createUpdateState(options: UpdateStateOptions): UpdateStateMachine {
  const now = options.now ?? (() => new Date());
  let state: PlatformUpdateState = {
    enabled: options.enabled,
    currentVersion: options.currentVersion,
    lastCheckedAt: null,
    phase: { kind: 'idle' },
  };

  const set = (next: Partial<PlatformUpdateState>): void => {
    state = { ...state, ...next };
    options.publish(state);
  };

  return {
    get: () => state,
    startCheck() {
      if (!state.enabled) return false;
      const kind = state.phase.kind;
      if (
        kind === 'checking' ||
        kind === 'downloading' ||
        kind === 'ready' ||
        kind === 'installing'
      ) {
        return false;
      }
      set({ phase: { kind: 'checking' } });
      return true;
    },
    found(version) {
      set({ phase: { kind: 'downloading', version, percent: 0, transferred: 0, total: 0 } });
    },
    progress({ percent, transferred, total }) {
      const phase = state.phase;
      if (phase.kind !== 'downloading') return;
      const whole = Math.max(0, Math.min(100, Math.floor(percent)));
      if (whole === phase.percent) return;
      set({ phase: { ...phase, percent: whole, transferred, total } });
    },
    ready(version) {
      set({ phase: { kind: 'ready', version } });
    },
    installing(queued) {
      const phase = state.phase;
      if (phase.kind !== 'ready' && phase.kind !== 'installing') return;
      set({ phase: { kind: 'installing', version: phase.version, queued } });
    },
    failed(error) {
      set({ phase: { kind: 'error', message: safeUpdateMessage(error) } });
    },
    finishCheck() {
      const phase = state.phase;
      set({
        lastCheckedAt: now().toISOString(),
        // A check that found nothing (or failed) is over; one that found an update moved on already.
        ...(phase.kind === 'checking' ? { phase: { kind: 'idle' as const } } : {}),
      });
    },
  };
}
