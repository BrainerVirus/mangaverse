// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { notifyDownloadStorageFull } from '../notices.js';

const { failureMock } = vi.hoisted(() => ({
  failureMock: vi.fn<(input: unknown) => void>(),
}));

vi.mock('@app/design-system', () => ({
  notify: { failure: failureMock, success: vi.fn<() => void>() },
}));

describe('download storage notice', () => {
  it('tells the user storage is full and offers storage management rather than a retry', () => {
    const openStorage = vi.fn<() => void>();

    notifyDownloadStorageFull({ chapterId: 'chapter-1' }, openStorage);

    expect(failureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'download-storage-full',
        message: expect.stringContaining('out of storage'),
        action: { label: 'Manage storage', onClick: openStorage },
      }),
    );
    const call = failureMock.mock.calls.at(-1)?.[0] as
      | { action?: { onClick?: () => void } }
      | undefined;
    call?.action?.onClick?.();
    expect(openStorage).toHaveBeenCalledOnce();
  });
});
