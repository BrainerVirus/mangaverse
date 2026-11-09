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
