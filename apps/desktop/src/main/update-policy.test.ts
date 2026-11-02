import { describe, expect, it, vi } from 'vitest';

import {
  createUpdatePromptController,
  decideUpdatePrompt,
  runQuietUpdateCheck,
  type UpdatePromptState,
} from './update-policy.js';

const idle: UpdatePromptState = {
  availableVersion: '1.2.0',
  promptedVersion: null,
  declinedVersions: [],
};

describe('decideUpdatePrompt', () => {
  it('asks when an update is available and the user is not reading', () => {
    expect(decideUpdatePrompt(idle, false)).toEqual({ kind: 'ask', version: '1.2.0' });
  });

  it('defers while a chapter is open', () => {
    expect(decideUpdatePrompt(idle, true)).toEqual({ kind: 'defer', version: '1.2.0' });
  });

  it('never re-prompts a version already asked about', () => {
    expect(decideUpdatePrompt({ ...idle, promptedVersion: '1.2.0' }, false)).toEqual({
      kind: 'none',
    });
  });

  it('never re-prompts a declined version', () => {
    expect(decideUpdatePrompt({ ...idle, declinedVersions: ['1.2.0'] }, false)).toEqual({
      kind: 'none',
    });
  });

  it('does nothing when no update is available', () => {
    expect(decideUpdatePrompt({ ...idle, availableVersion: null }, false)).toEqual({
      kind: 'none',
    });
  });
});

describe('createUpdatePromptController', () => {
  it('asks once when idle, then waits for an answer', () => {
    const prompt = vi.fn<(version: string) => void>();
    const controller = createUpdatePromptController({ prompt });

    controller.setAvailable('1.2.0');
    controller.setAvailable('1.2.0');

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledWith('1.2.0');
  });

  it('defers while reading, then asks when the reader closes', () => {
    const prompt = vi.fn<(version: string) => void>();
    const controller = createUpdatePromptController({ prompt });

    controller.setReaderCount(1);
    controller.setAvailable('1.2.0');
    expect(prompt).not.toHaveBeenCalled();

    controller.setReaderCount(2);
    controller.setReaderCount(1);
    expect(prompt).not.toHaveBeenCalled();

    controller.setReaderCount(0);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledWith('1.2.0');
  });

  it('does not loop after a decline, even when reading ends or checks repeat', () => {
    const prompt = vi.fn<(version: string) => void>();
    const controller = createUpdatePromptController({ prompt });

    controller.setAvailable('1.2.0');
    controller.decline('1.2.0');
    controller.setReaderCount(1);
    controller.setReaderCount(0);
    controller.setAvailable('1.2.0');

    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('asks again for a newer release after an older one was declined', () => {
    const prompt = vi.fn<(version: string) => void>();
    const controller = createUpdatePromptController({ prompt });

    controller.setAvailable('1.2.0');
    controller.decline('1.2.0');
    controller.setAvailable('1.3.0');

    expect(prompt).toHaveBeenNthCalledWith(2, '1.3.0');
  });

  it('ignores a blank version', () => {
    const prompt = vi.fn<(version: string) => void>();
    const controller = createUpdatePromptController({ prompt });
    controller.setAvailable('   ');
    expect(prompt).not.toHaveBeenCalled();
  });
});

describe('runQuietUpdateCheck', () => {
  it('reports an offline or failed check without throwing', async () => {
    const report = vi.fn<(message: string) => void>();
    await expect(
      runQuietUpdateCheck(async () => {
        throw new Error('net::ERR_INTERNET_DISCONNECTED');
      }, report),
    ).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith('Update check failed: net::ERR_INTERNET_DISCONNECTED');
  });

  it('does not report a successful check', async () => {
    const report = vi.fn<(message: string) => void>();
    await runQuietUpdateCheck(async () => undefined, report);
    expect(report).not.toHaveBeenCalled();
  });
});
