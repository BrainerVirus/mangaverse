import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createScriptUpdater,
  hasScriptInstall,
  isNewerNightly,
  scriptReceiptPath,
} from './script-updater.js';

describe('isNewerNightly', () => {
  it('orders the base version, date and run number', () => {
    expect(isNewerNightly('0.0.4-nightly.20261108.2', '0.0.4-nightly.20261108.3')).toBe(true);
    expect(isNewerNightly('0.0.4-nightly.20261108.3', '0.0.4-nightly.20261109.1')).toBe(true);
    expect(isNewerNightly('0.0.4-nightly.20261109.1', '0.0.5-nightly.20261101.1')).toBe(true);
    expect(isNewerNightly('0.0.4-nightly.20261108.3', '0.0.4-nightly.20261108.3')).toBe(false);
    expect(isNewerNightly('0.0.4-nightly.20261108.3', '0.0.4-nightly.20261108.2')).toBe(false);
  });

  it('ignores stable and malformed versions', () => {
    expect(isNewerNightly('0.0.4-nightly.20261108.3', '0.0.5')).toBe(false);
    expect(isNewerNightly('0.0.4', '0.0.5-nightly.20261109.1')).toBe(false);
  });
});

describe('scriptReceiptPath', () => {
  it('follows the installer layout on each OS', () => {
    expect(scriptReceiptPath('darwin', '/Users/a', {})).toBe(
      '/Users/a/Library/Application Support/MangaVerse Installer/receipt',
    );
    expect(scriptReceiptPath('linux', '/home/a', { XDG_DATA_HOME: '/home/a/data' })).toBe(
      '/home/a/data/mangaverse/receipt',
    );
    expect(
      scriptReceiptPath(
        'win32',
        'C:\\Users\\a',
        {},
        'C:\\Users\\a\\AppData\\Local\\Programs\\MangaVerse\\MangaVerse.exe',
      ),
    ).toBe('C:\\Users\\a\\AppData\\Local\\Programs\\MangaVerse\\receipt.json');
  });

  it('finds a custom Windows install because the receipt sits next to the exe', () => {
    expect(
      scriptReceiptPath('win32', 'C:\\Users\\a', {}, 'D:\\Apps\\MangaVerse\\MangaVerse.exe'),
    ).toBe('D:\\Apps\\MangaVerse\\receipt.json');
  });

  it('detects the receipt next to the app', () => {
    const home = mkdtempSync(join(tmpdir(), 'mangaverse-receipt-'));
    const receipt = scriptReceiptPath('darwin', home, {});
    expect(hasScriptInstall('darwin', home, {})).toBe(false);
    mkdirSync(join(home, 'Library', 'Application Support', 'MangaVerse Installer'), {
      recursive: true,
    });
    writeFileSync(receipt, 'channel=nightly\n');
    expect(hasScriptInstall('darwin', home, {})).toBe(true);
  });
});

function nightlyRelease(tag: string, prerelease = true) {
  return { tag_name: tag, prerelease };
}

const ASSET_BYTES = Buffer.from('release-bytes-'.repeat(1000));
const TAG = 'v0.0.4-nightly.20261108.2';
const VERSION = TAG.slice(1);
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const assetName = (platform: 'linux' | 'win32' | 'darwin', version: string) =>
  platform === 'linux'
    ? `MangaVerse-${version}-x86_64.AppImage`
    : platform === 'win32'
      ? `MangaVerse-${version}-x64.zip`
      : `MangaVerse-${version}-arm64.zip`;
const ASSETS = {
  linux: assetName('linux', VERSION),
  win32: assetName('win32', VERSION),
  darwin: assetName('darwin', VERSION),
} as const;

/**
 * GitHub as the updater sees it: the release list, the asset as a real stream, and SHA256SUMS.
 * `tags` is the newest release on each successive list call; `body` shapes the asset stream: it
 * completes, resets after the first chunk, goes silent after it, or waits on `openGate()`.
 */
function fakeGitHub(
  platform: keyof typeof ASSETS,
  options: {
    releasesStatus?: number;
    sums?: string;
    tags?: string[];
    body?: 'ok' | 'reset' | 'stall' | 'gate';
  } = {},
) {
  const asset = ASSETS[platform];
  const urls: string[] = [];
  const tags = options.tags ?? [TAG];
  let listCalls = 0;
  let openGate: () => void = () => {};
  let cancelled = false;
  const chunks = [0, 1, 2, 3].map((i) => ASSET_BYTES.subarray(i * 3500, (i + 1) * 3500));
  const fetchImpl = (async (input: string) => {
    urls.push(input);
    if (input.includes('api.github.com')) {
      const tag = tags[Math.min(listCalls, tags.length - 1)]!;
      listCalls += 1;
      return new Response(JSON.stringify([nightlyRelease(tag)]), {
        status: options.releasesStatus ?? 200,
      });
    }
    if (input.endsWith('/SHA256SUMS')) {
      const tag = /download\/(v[^/]+)\//.exec(input)![1]!;
      return new Response(
        options.sums ?? `${sha256(ASSET_BYTES)}  ${assetName(platform, tag.slice(1))}\n`,
      );
    }
    const download = /\/releases\/download\/(v[^/]+)\/(.+)$/.exec(input);
    if (download !== null && download[2] === assetName(platform, download[1]!.slice(1))) {
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(chunks[0]);
            if (options.body === 'reset') {
              controller.error(new Error('connection reset'));
            } else if (options.body === 'stall') {
              // Never closes: a connection that went quiet.
            } else if (options.body === 'gate') {
              return new Promise<void>((resolve) => {
                openGate = () => {
                  // A consumer that gave up has cancelled the stream by now; that is not an error here.
                  try {
                    for (const chunk of chunks.slice(1)) controller.enqueue(chunk);
                    controller.close();
                  } catch {
                    // cancelled
                  }
                  resolve();
                };
              });
            } else {
              for (const chunk of chunks.slice(1)) controller.enqueue(chunk);
              controller.close();
            }
            return undefined;
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'content-length': String(ASSET_BYTES.length) } },
      );
    }
    return new Response('not found', { status: 404 });
  }) as never;
  return { fetchImpl, urls, asset, openGate: () => openGate(), wasCancelled: () => cancelled };
}

describe('createScriptUpdater', () => {
  function resources(): { root: string; temp: string } {
    const root = mkdtempSync(join(tmpdir(), 'mangaverse-updater-'));
    mkdirSync(join(root, 'install'), { recursive: true });
    mkdirSync(join(root, 'tmp'), { recursive: true });
    writeFileSync(join(root, 'install', 'install.sh'), '#!/bin/sh\n');
    writeFileSync(join(root, 'install', 'install.ps1'), '# ps\n');
    return { root, temp: join(root, 'tmp') };
  }
  const entries = (temp: string, prefix: string) =>
    readdirSync(temp).filter((name) => name.startsWith(prefix));
  const spawnStub = () =>
    vi.fn<(...args: unknown[]) => { unref: () => void }>(() => ({ unref: () => {} }));

  it('Given a newer nightly, When checking, Then it downloads with progress, verifies, and hands the staged directory to the installer', async () => {
    const { root, temp } = resources();
    const github = fakeGitHub('linux');
    const quit = vi.fn<() => void>();
    const spawnImpl = spawnStub();
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: root,
      tempDir: temp,
      platform: 'linux',
      quit,
      spawnImpl: spawnImpl as never,
      fetchImpl: github.fetchImpl,
    });
    const events: string[] = [];
    const percents: number[] = [];
    updater.on('update-available', (info) => events.push(`available ${info.version}`));
    updater.on('download-progress', (progress) => {
      percents.push(progress.percent);
      expect(progress.total).toBe(ASSET_BYTES.length);
    });
    updater.on('update-downloaded', (info) => events.push(`downloaded ${info.version}`));

    await updater.checkForUpdates();
    expect(events).toEqual([`available ${VERSION}`, `downloaded ${VERSION}`]);
    expect(percents.length).toBeGreaterThan(1);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(percents.at(-1)).toBe(100);

    const [stagedName] = entries(temp, 'mangaverse-staged-');
    const stagedDir = join(temp, stagedName!);
    expect(readFileSync(join(stagedDir, github.asset))).toEqual(ASSET_BYTES);
    expect(readFileSync(join(stagedDir, 'SHA256SUMS'), 'utf8')).toContain(sha256(ASSET_BYTES));

    updater.quitAndInstall();
    const [command, args] = spawnImpl.mock.calls[0] as unknown as [string, string[]];
    const script = args[0]!;
    expect(command).toBe('/bin/sh');
    expect(basename(script)).toBe('install.sh');
    expect(basename(dirname(script))).toMatch(/^mangaverse-update-/);
    expect(readFileSync(script, 'utf8')).toBe('#!/bin/sh\n');
    expect(args.slice(1)).toEqual(['update', '--version', TAG, '--staged', stagedDir]);
    expect(quit).toHaveBeenCalledTimes(1);

    // The installer owns the directory now: disposing must not pull it from under it.
    updater.dispose?.();
    expect(existsSync(stagedDir)).toBe(true);
    expect(existsSync(script)).toBe(true);
  });

  it('Given a download that is never installed, When the updater is disposed, Then nothing is left in the temp directory', async () => {
    const { root, temp } = resources();
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: root,
      tempDir: temp,
      platform: 'linux',
      quit: () => {},
      fetchImpl: fakeGitHub('linux').fetchImpl,
    });
    await updater.checkForUpdates();
    expect(entries(temp, 'mangaverse-staged-')).toHaveLength(1);

    updater.dispose?.();
    expect(entries(temp, 'mangaverse-staged-')).toHaveLength(0);
    expect(entries(temp, 'mangaverse-update-')).toHaveLength(0);
  });

  it('Given SHA256SUMS that does not match the download, When checking, Then it reports a checksum error, offers nothing and leaves no staged files', async () => {
    const { root, temp } = resources();
    const error = vi.fn<(value: Error) => void>();
    const downloaded = vi.fn<(info: { version: string }) => void>();
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: root,
      tempDir: temp,
      platform: 'linux',
      quit: () => {},
      fetchImpl: fakeGitHub('linux', { sums: `${'0'.repeat(64)}  ${ASSETS.linux}\n` }).fetchImpl,
    });
    updater.on('error', error);
    updater.on('update-downloaded', downloaded);

    expect(await updater.checkForUpdates()).toBeNull();
    expect(error.mock.calls[0]?.[0]?.message).toContain('checksum mismatch');
    expect(downloaded).not.toHaveBeenCalled();
    expect(entries(temp, 'mangaverse-staged-')).toHaveLength(0);
  });

  it('Given the same release is already downloaded, When checking again, Then it is not downloaded twice', async () => {
    const { root, temp } = resources();
    const github = fakeGitHub('linux');
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: root,
      tempDir: temp,
      platform: 'linux',
      quit: () => {},
      fetchImpl: github.fetchImpl,
    });
    await updater.checkForUpdates();
    await updater.checkForUpdates();
    expect(github.urls.filter((url) => url.endsWith(`/${github.asset}`))).toHaveLength(1);
    expect(entries(temp, 'mangaverse-staged-')).toHaveLength(1);
  });

  it('Given the download is cut mid-stream, When checking, Then it reports the error, cleans up, and the next check can succeed', async () => {
    const { root, temp } = resources();
    const error = vi.fn<(value: Error) => void>();
    let broken = true;
    const good = fakeGitHub('linux');
    const bad = fakeGitHub('linux', { body: 'reset' });
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: root,
      tempDir: temp,
      platform: 'linux',
      quit: () => {},
      fetchImpl: ((input: string, init: unknown) =>
        (broken ? bad : good).fetchImpl(input, init)) as never,
    });
    updater.on('error', error);

    expect(await updater.checkForUpdates()).toBeNull();
    expect(error.mock.calls[0]?.[0]?.message).toContain('connection reset');
    expect(entries(temp, 'mangaverse-staged-')).toHaveLength(0);

    broken = false;
    const downloaded = vi.fn<(info: { version: string }) => void>();
    updater.on('update-downloaded', downloaded);
    await updater.checkForUpdates();
    expect(downloaded).toHaveBeenCalledWith({ version: VERSION });
  });

  it('Given a download that goes silent, When the stall timeout passes, Then it is abandoned, cleaned up, and later checks are not blocked', async () => {
    const { root, temp } = resources();
    const error = vi.fn<(value: Error) => void>();
    let stalling = true;
    const good = fakeGitHub('linux');
    const hung = fakeGitHub('linux', { body: 'stall' });
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: root,
      tempDir: temp,
      platform: 'linux',
      stallTimeoutMs: 60,
      quit: () => {},
      fetchImpl: ((input: string, init: unknown) =>
        (stalling ? hung : good).fetchImpl(input, init)) as never,
    });
    updater.on('error', error);

    expect(await updater.checkForUpdates()).toBeNull();
    expect(error.mock.calls[0]?.[0]?.message).toContain('stalled');
    expect(entries(temp, 'mangaverse-staged-')).toHaveLength(0);

    stalling = false;
    const downloaded = vi.fn<(info: { version: string }) => void>();
    updater.on('update-downloaded', downloaded);
    await updater.checkForUpdates();
    expect(downloaded).toHaveBeenCalledTimes(1);
  });

  it('Given a download in progress, When the updater is disposed, Then it stops quietly and nothing is written or left behind', async () => {
    const { root, temp } = resources();
    const github = fakeGitHub('linux', { body: 'gate' });
    const error = vi.fn<(value: Error) => void>();
    const downloaded = vi.fn<(info: { version: string }) => void>();
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: root,
      tempDir: temp,
      platform: 'linux',
      quit: () => {},
      fetchImpl: github.fetchImpl,
    });
    updater.on('error', error);
    updater.on('update-downloaded', downloaded);
    const firstChunk = new Promise<void>((resolve) =>
      updater.on('download-progress', () => resolve()),
    );

    const check = updater.checkForUpdates();
    await firstChunk;
    updater.dispose?.();
    // Disposing cancels the network stream at once; it does not wait for the response to finish.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(github.wasCancelled()).toBe(true);
    github.openGate();
    await check;

    expect(error).not.toHaveBeenCalled();
    expect(downloaded).not.toHaveBeenCalled();
    expect(entries(temp, 'mangaverse-staged-')).toHaveLength(0);
    expect(entries(temp, 'mangaverse-update-')).toHaveLength(0);
    expect(await updater.checkForUpdates()).toBeNull();
  });

  it('Given a newer release while an older one is staged, When checking, Then the old download is replaced and only one helper copy exists', async () => {
    const { root, temp } = resources();
    const NEWER = 'v0.0.4-nightly.20261108.3';
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: root,
      tempDir: temp,
      platform: 'linux',
      quit: () => {},
      fetchImpl: fakeGitHub('linux', { tags: [TAG, NEWER] }).fetchImpl,
    });
    const downloaded = vi.fn<(info: { version: string }) => void>();
    updater.on('update-downloaded', downloaded);

    await updater.checkForUpdates();
    await updater.checkForUpdates();

    expect(downloaded.mock.calls.map(([info]) => info.version)).toEqual([VERSION, NEWER.slice(1)]);
    const [stagedName] = entries(temp, 'mangaverse-staged-');
    expect(entries(temp, 'mangaverse-staged-')).toHaveLength(1);
    expect(readdirSync(join(temp, stagedName!))).toContain(assetName('linux', NEWER.slice(1)));
    expect(entries(temp, 'mangaverse-update-')).toHaveLength(1);
  });

  it('Given a progress listener that disposes at 100%, When the download completes, Then no download is announced and nothing is left behind', async () => {
    const { root, temp } = resources();
    const error = vi.fn<(value: Error) => void>();
    const downloaded = vi.fn<(info: { version: string }) => void>();
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: root,
      tempDir: temp,
      platform: 'linux',
      quit: () => {},
      fetchImpl: fakeGitHub('linux').fetchImpl,
    });
    updater.on('download-progress', (progress) => {
      if (progress.percent === 100) updater.dispose?.();
    });
    updater.on('update-downloaded', downloaded);
    updater.on('error', error);

    expect(await updater.checkForUpdates()).toBeNull();
    expect(downloaded).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(entries(temp, 'mangaverse-staged-')).toHaveLength(0);
    expect(entries(temp, 'mangaverse-update-')).toHaveLength(0);
  });

  it('Given a downloaded listener that disposes, When more listeners follow, Then they are not told about the removed download and the handoff does nothing', async () => {
    const { root, temp } = resources();
    const spawnImpl = spawnStub();
    const later = vi.fn<(info: { version: string }) => void>();
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: root,
      tempDir: temp,
      platform: 'linux',
      quit: () => {},
      spawnImpl: spawnImpl as never,
      fetchImpl: fakeGitHub('linux').fetchImpl,
    });
    updater.on('update-downloaded', () => updater.dispose?.());
    updater.on('update-downloaded', later);

    await updater.checkForUpdates();
    expect(later).not.toHaveBeenCalled();
    expect(entries(temp, 'mangaverse-staged-')).toHaveLength(0);
    updater.quitAndInstall();
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('Given the installer is started from the downloaded listener and the app disposes while quitting, Then the installer keeps its directories and a second call starts nothing', async () => {
    const { root, temp } = resources();
    const spawnImpl = spawnStub();
    const quit = vi.fn<() => void>(() => updater.dispose?.());
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: root,
      tempDir: temp,
      platform: 'linux',
      quit,
      spawnImpl: spawnImpl as never,
      fetchImpl: fakeGitHub('linux').fetchImpl,
    });
    updater.on('update-downloaded', () => {
      updater.quitAndInstall();
      updater.quitAndInstall();
    });

    await updater.checkForUpdates();
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
    const [, args] = spawnImpl.mock.calls[0] as unknown as [string, string[]];
    expect(existsSync(args.at(-1)!)).toBe(true);
    expect(existsSync(args[0]!)).toBe(true);
  });

  it('Given Windows, When installing, Then the staged directory and the custom install directory go to the PowerShell helper', async () => {
    const base = mkdtempSync(join(tmpdir(), 'mangaverse-updater-win-'));
    const appRoot = join(base, 'Programs', 'MangaVerse');
    mkdirSync(join(appRoot, 'resources', 'install'), { recursive: true });
    mkdirSync(join(base, 'tmp'), { recursive: true });
    writeFileSync(join(appRoot, 'resources', 'install', 'install.ps1'), '# ps\n');
    const spawnImpl = spawnStub();
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: join(appRoot, 'resources'),
      tempDir: join(base, 'tmp'),
      platform: 'win32',
      quit: () => {},
      spawnImpl: spawnImpl as never,
      fetchImpl: fakeGitHub('win32').fetchImpl,
    });

    await updater.checkForUpdates();
    updater.quitAndInstall();

    const [command, args] = spawnImpl.mock.calls[0] as unknown as [string, string[]];
    expect(command).toBe('powershell.exe');
    expect(args[0]).toBe('-NoProfile');
    expect(args[args.indexOf('-Action') + 1]).toBe('update');
    expect(args[args.indexOf('-Version') + 1]).toBe(TAG);
    expect(basename(args[args.indexOf('-Staged') + 1]!)).toMatch(/^mangaverse-staged-/);
    expect(args[args.indexOf('-InstallDir') + 1]).toBe(appRoot);
  });

  it('does nothing when the newest nightly is not newer', async () => {
    const downloaded = vi.fn<(info: { version: string }) => void>();
    const github = fakeGitHub('linux');
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.2',
      resourcesPath: resources().root,
      quit: () => {},
      fetchImpl: github.fetchImpl,
    });
    updater.on('update-downloaded', downloaded);

    expect(await updater.checkForUpdates()).toBeNull();
    expect(downloaded).not.toHaveBeenCalled();
    expect(github.urls.every((url) => url.includes('api.github.com'))).toBe(true);
  });

  it('reports a provider failure without throwing', async () => {
    const error = vi.fn<(value: Error) => void>();
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: resources().root,
      quit: () => {},
      fetchImpl: fakeGitHub('linux', { releasesStatus: 503 }).fetchImpl,
    });
    updater.on('error', error);

    await expect(updater.checkForUpdates()).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'GitHub returned 503' }));
  });

  it('does not offer an update it cannot stage', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mangaverse-updater-empty-'));
    const error = vi.fn<(value: Error) => void>();
    const github = fakeGitHub('linux');
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: root,
      tempDir: root,
      quit: () => {},
      fetchImpl: github.fetchImpl,
    });
    updater.on('error', error);

    expect(await updater.checkForUpdates()).toBeNull();
    expect(error.mock.calls[0]?.[0]?.message).toContain('update helper missing');
    expect(github.urls.some((url) => url.includes('/releases/download/'))).toBe(false);
  });
});
