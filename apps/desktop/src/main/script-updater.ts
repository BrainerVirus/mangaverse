/**
 * Nightly updates for installs created by scripts/install/install.sh or install.ps1.
 *
 * The paid-signing route cannot update an ad-hoc macOS bundle through Squirrel, so this
 * small updater does the same job the Tauri updater does: check a channel, ask the user,
 * then hand off to a signed-by-checksum installer script that replaces the app and
 * relaunches it. Windows/Linux use the same contract.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createWriteStream, existsSync, rmSync } from 'node:fs';
import { chmod, copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, posix as pathPosix, win32 as pathWin32 } from 'node:path';
import type { UpdateProgress, UpdaterLike } from './updater.js';
import type { UpdateCheckResult } from './update-policy.js';

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
 * The `UpdaterLike` slice used by registerAutoUpdate. A newer release is downloaded here, with
 * progress, into a private `mangaverse-staged-*` directory and checked against the release's
 * SHA256SUMS; the installer script then re-verifies it and swaps the build after the app exits
 * (`--staged`, see scripts/install). A download that is never installed is removed on dispose.
 */
export function createScriptUpdater(options: ScriptUpdaterOptions): UpdaterLike {
  const fetchImpl = options.fetchImpl ?? fetch;
  const spawnImpl = options.spawnImpl ?? spawn;
  const platform = options.platform ?? process.platform;
  const log = options.log ?? (() => {});
  type EventName = 'update-available' | 'download-progress' | 'update-downloaded' | 'error';
  const listeners: Record<EventName, Set<Listener>> = {
    'update-available': new Set(),
    'download-progress': new Set(),
    'update-downloaded': new Set(),
    error: new Set(),
  };
  const emit = (event: EventName, value: unknown): void => {
    for (const listener of listeners[event]) listener(value as never);
  };
  let pending: { readonly version: string; readonly tag: string } | null = null;
  // The directory a finished (or running) download lives in. Once the installer owns it, it is
  // the installer's to delete, so dispose leaves it alone.
  let stagedDir: string | null = null;
  let handedOff = false;
  let inFlight: Promise<UpdateCheckResult | null> | null = null;

  const helperName = platform === 'win32' ? 'install.ps1' : 'install.sh';
  // The installer replaces (and on macOS deletes) the app bundle it came from, so it runs
  // from a fresh 0700 directory: a shell cannot keep reading a script whose file was removed,
  // and a fixed shared-temp name could be pre-created by another local user.
  let stagedScript: string | null = null;

  // Stage before downloading so accepting can never fail on a missing or unreadable helper.
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

  const assetFor = (version: string): string =>
    platform === 'win32'
      ? `MangaVerse-${version}-x64.zip`
      : platform === 'darwin'
        ? `MangaVerse-${version}-arm64.zip`
        : `MangaVerse-${version}-x86_64.AppImage`;

  const discardDownload = async (): Promise<void> => {
    const dir = stagedDir;
    stagedDir = null;
    if (dir !== null) await rm(dir, { recursive: true, force: true });
  };

  /** Streams the asset to disk with progress, then checks it against the release's SHA256SUMS. */
  const download = async (release: { readonly version: string; readonly tag: string }) => {
    const base = `https://github.com/${REPO}/releases/download/${release.tag}`;
    const asset = assetFor(release.version);
    const headers = { 'User-Agent': 'MangaVerse-Updater' };
    const dir = await mkdtemp(join(options.tempDir ?? tmpdir(), 'mangaverse-staged-'));
    stagedDir = dir;

    const response = await fetchImpl(`${base}/${asset}`, { headers });
    if (!response.ok || response.body === null) {
      throw new Error(`GitHub returned ${String(response.status)} for ${asset}`);
    }
    const total = Number(response.headers.get('content-length') ?? 0) || 0;
    const hash = createHash('sha256');
    const file = createWriteStream(join(dir, asset), { mode: 0o600 });
    let transferred = 0;
    let lastPercent = -1;
    const report = (percent: number): void => {
      if (percent === lastPercent) return;
      lastPercent = percent;
      const progress: UpdateProgress = {
        percent,
        transferred,
        total: total > 0 ? total : transferred,
      };
      emit('download-progress', progress);
    };
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk);
      if (!file.write(chunk)) await once(file, 'drain');
      transferred += chunk.byteLength;
      report(total > 0 ? Math.min(99, Math.floor((transferred / total) * 100)) : 0);
    }
    await new Promise<void>((resolve, reject) => {
      file.once('error', reject);
      file.end(resolve);
    });

    const sums = await fetchImpl(`${base}/SHA256SUMS`, { headers });
    if (!sums.ok) throw new Error(`GitHub returned ${String(sums.status)} for SHA256SUMS`);
    const sumsText = await sums.text();
    const expected = sumsText
      .split('\n')
      .map((line) => line.trim().split(/\s+/))
      .find((fields) => fields.length === 2 && fields[1] === asset)?.[0];
    if (expected === undefined) throw new Error(`SHA256SUMS has no entry for ${asset}`);
    if (expected.toLowerCase() !== hash.digest('hex')) {
      throw new Error(`checksum mismatch for ${asset}`);
    }
    await writeFile(join(dir, 'SHA256SUMS'), sumsText, { mode: 0o600 });
    report(100);
  };

  const check = (): Promise<UpdateCheckResult | null> => {
    if (inFlight !== null) return inFlight;
    inFlight = checkChannel()
      .then(async (found) => {
        if (found === null) return null;
        // The same release is already on disk and waiting.
        if (pending?.tag === found.tag && stagedDir !== null) return { downloadPromise: null };
        pending = null;
        await discardDownload();
        stagedScript = await stageHelper();
        emit('update-available', { version: found.version });
        await download(found);
        pending = found;
        emit('update-downloaded', { version: found.version });
        return { downloadPromise: null };
      })
      .catch(async (error: unknown) => {
        await discardDownload();
        emit('error', error instanceof Error ? error : new Error(String(error)));
        return null;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  return {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: null,
    on(event, listener) {
      listeners[event].add(listener as Listener);
      return undefined;
    },
    off(event, listener) {
      listeners[event].delete(listener as Listener);
      return undefined;
    },
    checkForUpdates: check,
    quitAndInstall() {
      if (pending === null || stagedScript === null || stagedDir === null) return;
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
              '-Staged',
              stagedDir,
              // resourcesPath is <installDir>\resources, so this also covers a custom dir.
              '-InstallDir',
              dirname(options.resourcesPath),
            ]
          : [stagedScript, 'update', '--version', pending.tag, '--staged', stagedDir];
      log(`handing ${pending.version} to ${stagedScript}`);
      handedOff = true;
      const child = spawnImpl(command, args, { detached: true, stdio: 'ignore' });
      child.unref();
      options.quit();
    },
    dispose() {
      // After the handoff the installer owns both directories; before it, nothing may be left behind.
      if (handedOff) return;
      if (stagedDir !== null) rmSync(stagedDir, { recursive: true, force: true });
      if (stagedScript !== null) rmSync(dirname(stagedScript), { recursive: true, force: true });
      stagedDir = null;
      stagedScript = null;
    },
  };
}
