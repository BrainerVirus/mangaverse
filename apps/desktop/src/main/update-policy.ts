/**
 * Auto-update prompt policy (#215, spec 04 X7/X8).
 *
 * Pure state so the rules can be tested without Electron or the network:
 * - an available release asks at most once,
 * - while any window is reading a chapter the prompt waits until reading ends,
 * - a declined release is never offered again in this session,
 * - a failed or offline check changes nothing and never throws.
 */

export interface UpdatePromptState {
  readonly availableVersion: string | null;
  readonly promptedVersion: string | null;
  readonly declinedVersions: readonly string[];
}

export type UpdatePromptAction =
  | { readonly kind: 'ask'; readonly version: string }
  | { readonly kind: 'defer'; readonly version: string }
  | { readonly kind: 'none' };

/** The single decision point the controller and tests share. */
export function decideUpdatePrompt(
  state: UpdatePromptState,
  readerActive: boolean,
): UpdatePromptAction {
  const { availableVersion } = state;
  if (availableVersion === null) return { kind: 'none' };
  if (state.declinedVersions.includes(availableVersion)) return { kind: 'none' };
  if (state.promptedVersion === availableVersion) return { kind: 'none' };
  return readerActive
    ? { kind: 'defer', version: availableVersion }
    : { kind: 'ask', version: availableVersion };
}

export interface UpdatePromptControllerDeps {
  /** Shows the renderer's "restart and install" prompt for this version. */
  readonly prompt: (version: string) => void;
}

export interface UpdatePromptController {
  /** An update check found this release; asks now unless reading or already asked. */
  setAvailable(version: string): void;
  /** A window entered (or left) the reader. The prompt waits while any is open. */
  setReaderCount(count: number): void;
  /** The user chose "Later": this version is not offered again this session. */
  decline(version: string): void;
  /** For tests and diagnostics. */
  state(): UpdatePromptState & { readonly readerCount: number };
}

export function createUpdatePromptController(
  deps: UpdatePromptControllerDeps,
): UpdatePromptController {
  let availableVersion: string | null = null;
  let promptedVersion: string | null = null;
  let readerCount = 0;
  const declined = new Set<string>();

  const evaluate = () => {
    const state: UpdatePromptState = {
      availableVersion,
      promptedVersion,
      declinedVersions: [...declined],
    };
    const action = decideUpdatePrompt(state, readerCount > 0);
    if (action.kind !== 'ask') return;
    promptedVersion = action.version;
    deps.prompt(action.version);
  };

  return {
    setAvailable(version) {
      const trimmed = version.trim();
      if (trimmed.length === 0 || availableVersion === trimmed) return;
      availableVersion = trimmed;
      evaluate();
    },
    setReaderCount(count) {
      readerCount = Math.max(0, Math.trunc(count));
      evaluate();
    },
    decline(version) {
      declined.add(version);
      evaluate();
    },
    state() {
      return { availableVersion, promptedVersion, declinedVersions: [...declined], readerCount };
    },
  };
}

/**
 * Runs one update check. A failure (offline, rate limit, missing feed) is logged quietly and
 * never reaches the user or blocks startup.
 */
export async function runQuietUpdateCheck(
  check: () => Promise<unknown>,
  report: (message: string) => void,
): Promise<void> {
  await check().catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : 'unknown error';
    report(`Update check failed: ${detail}`);
  });
}
