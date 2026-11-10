import type { PlatformUpdateState } from '@app/platform';

export interface UpdateDescription {
  readonly title: string;
  readonly detail: string;
}

/** The nightly builds carry a `-nightly` prerelease tag; everything else is a stable release. */
export function updateChannel(version: string): 'Nightly' | 'Stable' {
  return version.includes('-nightly') ? 'Nightly' : 'Stable';
}

const LAST_CHECKED_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatLastChecked(iso: string | null): string {
  if (iso === null) return 'Not checked yet';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not checked yet';
  return LAST_CHECKED_FORMAT.format(date);
}

/** One plain sentence for the state, plus the detail that changes often (kept out of the live region). */
export function describeUpdate(state: PlatformUpdateState): UpdateDescription {
  if (!state.enabled) {
    return {
      title: 'Updates are off in this build',
      detail: 'Development and unpackaged builds do not update themselves.',
    };
  }
  const phase = state.phase;
  switch (phase.kind) {
    case 'idle':
      return state.lastCheckedAt === null
        ? { title: 'No update checked yet', detail: 'The app checks for updates on its own.' }
        : { title: 'You are up to date', detail: `Version ${state.currentVersion}.` };
    case 'checking':
      return { title: 'Checking for updates…', detail: 'This usually takes a moment.' };
    case 'downloading':
      return {
        title: `Downloading ${phase.version}`,
        detail: `${phase.percent}% — it installs only when you choose to restart.`,
      };
    case 'ready':
      return {
        title: `${phase.version} is ready to install`,
        detail: 'Restart to finish. Your reading progress is already saved.',
      };
    case 'installing':
      return phase.queued
        ? {
            title: `Restart queued for ${phase.version}`,
            detail: 'MangaVerse will restart when you finish reading.',
          }
        : { title: `Restarting to install ${phase.version}`, detail: 'The app will reopen.' };
    case 'error':
      return { title: 'The update did not finish', detail: phase.message };
  }
}

type TitleBarUpdateKind = 'downloading' | 'ready' | 'queued' | 'restarting';

export interface TitleBarUpdate {
  readonly kind: TitleBarUpdateKind;
  /** The short visible text: the percent while downloading, else the action. */
  readonly label: string;
  /** The accessible name; it repeats the visible label and adds the version. */
  readonly name: string;
  /** 0-100 while a release downloads, else `null`. */
  readonly percent: number | null;
}

/**
 * The title bar's Update pill: shown only while a release downloads, waits for a restart or
 * installs. A download shows just its percent (the ring and the name carry the rest).
 */
export function titleBarUpdate(state: PlatformUpdateState | null): TitleBarUpdate | null {
  if (state === null) return null;
  const phase = state.phase;
  switch (phase.kind) {
    case 'downloading': {
      const label = `${phase.percent}%`;
      return {
        kind: 'downloading',
        label,
        name: `Downloading update ${phase.version}, ${label}`,
        percent: phase.percent,
      };
    }
    case 'ready':
      return {
        kind: 'ready',
        label: 'Restart to update',
        name: `Restart to update: ${describeUpdate(state).title}`,
        percent: null,
      };
    case 'installing': {
      const label = updateAction(state).label;
      return {
        kind: phase.queued ? 'queued' : 'restarting',
        label,
        name: `${label}: ${describeUpdate(state).title}`,
        percent: null,
      };
    }
    default:
      return null;
  }
}

export type UpdateActionKind = 'check' | 'install' | 'busy' | 'off';

/**
 * The page's one action button. `busy` is announced as disabled but stays focusable, so a keyboard
 * user who just pressed it keeps their place while the check or download runs.
 */
export function updateAction(state: PlatformUpdateState): {
  readonly label: string;
  readonly kind: UpdateActionKind;
} {
  if (!state.enabled) return { label: 'Check for updates', kind: 'off' };
  const phase = state.phase;
  switch (phase.kind) {
    case 'idle':
    case 'error':
      return { label: 'Check for updates', kind: 'check' };
    case 'checking':
      return { label: 'Checking…', kind: 'busy' };
    case 'downloading':
      return { label: 'Downloading…', kind: 'busy' };
    case 'ready':
      return { label: 'Restart and install', kind: 'install' };
    case 'installing':
      return { label: phase.queued ? 'Restart queued' : 'Restarting…', kind: 'busy' };
  }
}

/** "40.2 MB": decimal megabytes, the unit the OS shows for a download. */
export function formatMegabytes(bytes: number): string {
  return `${(Math.max(0, bytes) / 1_000_000).toFixed(1)} MB`;
}

export interface UpdatePopoverCopy {
  readonly kind: TitleBarUpdateKind;
  /** Announced once per phase: it never carries the percent. */
  readonly title: string;
  readonly detail: string;
  /** The download's bar and its quiet readout; `null` outside a download. */
  readonly progress: { readonly percent: number; readonly text: string } | null;
}

/**
 * The words in the title-bar popover, per phase. Only the phases the Update pill shows have copy;
 * everything else is `null` (the popover has nothing to say and no pill to hang from).
 */
export function updatePopoverCopy(state: PlatformUpdateState | null): UpdatePopoverCopy | null {
  if (state === null) return null;
  const phase = state.phase;
  switch (phase.kind) {
    case 'downloading':
      return {
        kind: 'downloading',
        title: `Downloading MangaVerse ${phase.version}`,
        detail: 'It installs only when you restart.',
        progress: {
          percent: phase.percent,
          text:
            phase.total > 0
              ? `${formatMegabytes(phase.transferred)} of ${formatMegabytes(phase.total)}`
              : `${phase.percent}%`,
        },
      };
    case 'ready':
      return {
        kind: 'ready',
        title: `MangaVerse ${phase.version} is ready`,
        detail: 'Restart to finish. Your reading progress is already saved.',
        progress: null,
      };
    case 'installing':
      return phase.queued
        ? {
            kind: 'queued',
            title: 'Restart queued',
            detail: 'MangaVerse will restart when you finish reading.',
            progress: null,
          }
        : {
            kind: 'restarting',
            title: 'Restarting…',
            detail: 'The app will reopen.',
            progress: null,
          };
    default:
      return null;
  }
}
