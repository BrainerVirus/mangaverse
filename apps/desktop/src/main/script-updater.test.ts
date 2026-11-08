import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

describe('createScriptUpdater', () => {
  function resources(): { root: string; temp: string } {
    const root = mkdtempSync(join(tmpdir(), 'mangaverse-updater-'));
    mkdirSync(join(root, 'install'), { recursive: true });
    mkdirSync(join(root, 'tmp'), { recursive: true });
    writeFileSync(join(root, 'install', 'install.sh'), '#!/bin/sh\n');
    writeFileSync(join(root, 'install', 'install.ps1'), '# ps\n');
    return { root, temp: join(root, 'tmp') };
  }

  it('stages a copy of the installer and hands it the new tag', async () => {
    const { root, temp } = resources();
    const quit = vi.fn<() => void>();
    const spawnImpl = vi.fn<(...args: unknown[]) => { unref: () => void }>(() => ({
      unref: () => {},
    }));
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: root,
      tempDir: temp,
      platform: 'linux',
      quit,
      spawnImpl: spawnImpl as never,
      fetchImpl: (async () => ({
        ok: true,
        json: async () => [nightlyRelease('v0.0.4-nightly.20261108.2')],
      })) as never,
    });
    const downloaded = vi.fn<(info: { version: string }) => void>();
    updater.on('update-downloaded', downloaded);

    await updater.checkForUpdates();
    expect(downloaded).toHaveBeenCalledWith({ version: '0.0.4-nightly.20261108.2' });

    updater.quitAndInstall();
    const [command, args] = spawnImpl.mock.calls[0] as unknown as [string, string[]];
    const staged = args[0]!;
    expect(command).toBe('/bin/sh');
    expect(basename(staged)).toBe('install.sh');
    expect(dirname(staged).startsWith(temp)).toBe(true);
    expect(basename(dirname(staged))).toMatch(/^mangaverse-update-/);
    expect(readFileSync(staged, 'utf8')).toBe('#!/bin/sh\n');
    expect(args.slice(1)).toEqual(['update', '--version', 'v0.0.4-nightly.20261108.2']);
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('passes a custom Windows install directory to the PowerShell helper', async () => {
    const base = mkdtempSync(join(tmpdir(), 'mangaverse-updater-win-'));
    const appRoot = join(base, 'Programs', 'MangaVerse');
    mkdirSync(join(appRoot, 'resources', 'install'), { recursive: true });
    mkdirSync(join(base, 'tmp'), { recursive: true });
    writeFileSync(join(appRoot, 'resources', 'install', 'install.ps1'), '# ps\n');
    const spawnImpl = vi.fn<(...args: unknown[]) => { unref: () => void }>(() => ({
      unref: () => {},
    }));
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: join(appRoot, 'resources'),
      tempDir: join(base, 'tmp'),
      platform: 'win32',
      quit: () => {},
      spawnImpl: spawnImpl as never,
      fetchImpl: (async () => ({
        ok: true,
        json: async () => [nightlyRelease('v0.0.4-nightly.20261108.2')],
      })) as never,
    });

    await updater.checkForUpdates();
    updater.quitAndInstall();

    const [command, args] = spawnImpl.mock.calls[0] as unknown as [string, string[]];
    expect(command).toBe('powershell.exe');
    expect(args[0]).toBe('-NoProfile');
    expect(args).toContain('-Action');
    expect(args[args.indexOf('-Action') + 1]).toBe('update');
    expect(args[args.indexOf('-Version') + 1]).toBe('v0.0.4-nightly.20261108.2');
    expect(args[args.indexOf('-InstallDir') + 1]).toBe(appRoot);
  });

  it('does nothing when the newest nightly is not newer', async () => {
    const downloaded = vi.fn<(info: { version: string }) => void>();
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.2',
      resourcesPath: resources().root,
      quit: () => {},
      fetchImpl: (async () => ({
        ok: true,
        json: async () => [nightlyRelease('v0.0.4-nightly.20261108.2')],
      })) as never,
    });
    updater.on('update-downloaded', downloaded);

    expect(await updater.checkForUpdates()).toBeNull();
    expect(downloaded).not.toHaveBeenCalled();
  });

  it('reports a provider failure without throwing', async () => {
    const error = vi.fn<(value: Error) => void>();
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: resources().root,
      quit: () => {},
      fetchImpl: (async () => ({ ok: false, status: 503, json: async () => [] })) as never,
    });
    updater.on('error', error);

    await expect(updater.checkForUpdates()).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'GitHub returned 503' }));
  });

  it('does not offer an update it cannot stage', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mangaverse-updater-empty-'));
    const error = vi.fn<(value: Error) => void>();
    const updater = createScriptUpdater({
      currentVersion: '0.0.4-nightly.20261108.1',
      resourcesPath: root,
      tempDir: root,
      quit: () => {},
      fetchImpl: (async () => ({
        ok: true,
        json: async () => [nightlyRelease('v0.0.4-nightly.20261108.2')],
      })) as never,
    });
    updater.on('error', error);

    expect(await updater.checkForUpdates()).toBeNull();
    expect(error.mock.calls[0]?.[0]?.message).toContain('update helper missing');
  });
});
