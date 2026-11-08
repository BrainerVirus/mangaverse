/**
 * Nightly updates for installs created by scripts/install/install.sh or install.ps1.
 *
 * The paid-signing route cannot update an ad-hoc macOS bundle through Squirrel, so this
 * small updater does the same job the Tauri updater does: check a channel, ask the user,
 * then hand off to a signed-by-checksum installer script that replaces the app and
 * relaunches it. Windows/Linux use the same contract.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdtemp } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, posix as pathPosix, win32 as pathWin32 } from 'node:path';
import type { UpdaterLike } from './updater.js';

const REPO = 'BrainerVirus/mangaverse';
const NIGHTLY_PATTERN = /^(\d+)\.(\d+)\.(\d+)-nightly\.(\d{8})\.(\d+)$/;

interface NightlyVersion {
  readonly base: readonly [number, number, number];
  readonly date: number;
  readonly run: number;
}

function parseNightly(version: string): NightlyVersion | null {
  const match = NIGHTLY_PATTERN.exec(version.trim().replace(/^v/, ''));
  if (match === null) return null;
  return {
    base: [Number(match[1]), Number(match[2]), Number(match[3])],
    date: Number(match[4]),
    run: Number(match[5]),
  };
}

/** True only for a newer nightly of the same or a newer base version. */
export function isNewerNightly(current: string, candidate: string): boolean {
  const a = parseNightly(current);
  const b = parseNightly(candidate);
  if (a === null || b === null) return false;
  for (let index = 0; index < 3; index += 1) {
    if (b.base[index] !== a.base[index]) return b.base[index]! > a.base[index]!;
  }
  if (b.date !== a.date) return b.date > a.date;
  return b.run > a.run;
}

/** Where the script installer records the fact that it owns this installation. */
export function scriptReceiptPath(
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
  env: NodeJS.ProcessEnv = process.env,
  execPath: string = process.execPath,
): string {
  if (platform === 'darwin') {
    return pathPosix.join(
      home,
      'Library',
      'Application Support',
      'MangaVerse Installer',
      'receipt',
    );
  }
  if (platform === 'win32') {
    // The Windows receipt sits next to the exe, so a custom -InstallDir is discoverable too.
    return pathWin32.join(pathWin32.dirname(execPath), 'receipt.json');
  }
  const data = env['XDG_DATA_HOME'] ?? pathPosix.join(home, '.local', 'share');
  return pathPosix.join(data, 'mangaverse', 'receipt');
}

export function hasScriptInstall(
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
  env: NodeJS.ProcessEnv = process.env,
  execPath: string = process.execPath,
): boolean {
  return existsSync(scriptReceiptPath(platform, home, env, execPath));
}

export interface ScriptUpdaterOptions {
  readonly currentVersion: string;
  readonly resourcesPath: string;
  readonly fetchImpl?: typeof fetch;
  readonly spawnImpl?: typeof spawn;
  readonly quit: () => void;
  readonly log?: (message: string) => void;
  readonly platform?: NodeJS.Platform;
  /** Where the helper script is copied before it runs; tests redirect it. */
  readonly tempDir?: string;
}

type Listener = (value: never) => void;

/**
 * The `UpdaterLike` slice used by registerAutoUpdate. It never downloads in the app:
 * the installer script fetches, verifies and swaps the new build after the app exits.
 */
export function createScriptUpdater(options: ScriptUpdaterOptions): UpdaterLike {
  const fetchImpl = options.fetchImpl ?? fetch;
  const spawnImpl = options.spawnImpl ?? spawn;
  const platform = options.platform ?? process.platform;
  const log = options.log ?? (() => {});
  const downloaded = new Set<Listener>();
  const errors = new Set<Listener>();
  let pending: { readonly version: string; readonly tag: string } | null = null;

  const emit = <T>(listeners: Set<Listener>, value: T): void => {
    for (const listener of listeners) listener(value as never);
  };

  const helperName = platform === 'win32' ? 'install.ps1' : 'install.sh';
  // The installer replaces (and on macOS deletes) the app bundle it came from, so it runs
  // from a fresh 0700 directory: a shell cannot keep reading a script whose file was removed,
  // and a fixed shared-temp name could be pre-created by another local user.
  let stagedScript: string | null = null;

  // Stage before prompting so accepting can never fail on a missing or unreadable helper.
  const stageHelper = async (): Promise<string> => {
    const bundled = join(options.resourcesPath, 'install', helperName);
    if (!existsSync(bundled)) throw new Error(`update helper missing: ${bundled}`);
    const dir = await mkdtemp(join(options.tempDir ?? tmpdir(), 'mangaverse-update-'));
    const script = join(dir, helperName);
    await copyFile(bundled, script);
    await chmod(script, 0o700);
    return script;
  };

  const checkChannel = async (): Promise<{
    readonly version: string;
    readonly tag: string;
  } | null> => {
    const response = await fetchImpl(`https://api.github.com/repos/${REPO}/releases?per_page=30`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'MangaVerse-Updater',
      },
    });
    if (!response.ok) throw new Error(`GitHub returned ${String(response.status)}`);
    const releases = (await response.json()) as readonly {
      readonly tag_name?: unknown;
      readonly prerelease?: unknown;
    }[];
    const release = releases.find(
      (entry) =>
        entry.prerelease === true &&
        typeof entry.tag_name === 'string' &&
        entry.tag_name.includes('-nightly.'),
    );
    if (release === undefined || typeof release.tag_name !== 'string') return null;
    const tag = release.tag_name;
    const version = tag.replace(/^v/, '');
    return isNewerNightly(options.currentVersion, version) ? { version, tag } : null;
  };

  return {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: null,
    on(event, listener) {
      (event === 'update-downloaded' ? downloaded : errors).add(listener as Listener);
      return undefined;
    },
    off(event, listener) {
      (event === 'update-downloaded' ? downloaded : errors).delete(listener as Listener);
      return undefined;
    },
    checkForUpdates() {
      return checkChannel()
        .then(async (found) => {
          if (found === null) return null;
          stagedScript = await stageHelper();
          pending = found;
          emit(downloaded, { version: found.version });
          return { downloadPromise: null };
        })
        .catch((error: unknown) => {
          emit(errors, error instanceof Error ? error : new Error(String(error)));
          return null;
        });
    },
    quitAndInstall() {
      if (pending === null || stagedScript === null) return;
      const command = platform === 'win32' ? 'powershell.exe' : '/bin/sh';
      const args =
        platform === 'win32'
          ? [
              '-NoProfile',
              '-ExecutionPolicy',
              'Bypass',
              '-File',
              stagedScript,
              '-Action',
              'update',
              '-Version',
              pending.tag,
              // resourcesPath is <installDir>\resources, so this also covers a custom dir.
              '-InstallDir',
              dirname(options.resourcesPath),
            ]
          : [stagedScript, 'update', '--version', pending.tag];
      log(`handing ${pending.version} to ${stagedScript}`);
      const child = spawnImpl(command, args, { detached: true, stdio: 'ignore' });
      child.unref();
      options.quit();
    },
  };
}
