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
      return { title: `Restarting to install ${phase.version}`, detail: 'The app will reopen.' };
    case 'error':
      return { title: 'The update did not finish', detail: phase.message };
  }
}

/** Whether "Check for updates" can start a check right now. */
export function canCheckForUpdates(state: PlatformUpdateState): boolean {
  if (!state.enabled) return false;
  const kind = state.phase.kind;
  return kind === 'idle' || kind === 'error';
}
