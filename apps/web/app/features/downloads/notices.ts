import { notify } from '@app/design-system';

/**
 * A download stopped because the device is full. This is the app's normal background
 * failure notice, with storage management as its action instead of a retry that would
 * only hit the same wall (#222, spec 06 O6).
 */
export function notifyDownloadStorageFull(
  download: { readonly chapterId: string },
  openStorage: () => void,
): void {
  notify.failure({
    key: 'download-storage-full',
    message: `The device is out of storage, so “${download.chapterId}” stopped downloading. Pages already saved were kept.`,
    action: { label: 'Manage storage', onClick: openStorage },
  });
}
