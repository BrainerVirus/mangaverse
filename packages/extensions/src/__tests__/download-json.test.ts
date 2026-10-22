/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadJson } from '../download-json.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('downloadJson', () => {
  it('revokes the object URL after the click so Safari can start the download', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn<() => string>(() => 'blob:mangaverse');
    const revokeObjectURL = vi.fn<(url: string) => void>();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadJson('extensions.json', '{"version":2}');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mangaverse');
  });

  it('names the download file', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('extensions.json');
    });
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:mangaverse',
      revokeObjectURL: () => {},
    });

    downloadJson('extensions.json', '{}');

    expect(click).toHaveBeenCalledTimes(1);
  });
});
