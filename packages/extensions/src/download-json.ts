const REVOKE_DELAY_MS = 1000;

/**
 * Downloads JSON as a file.
 *
 * Safari ignores a detached anchor, so the anchor is attached before the
 * click, then removed. Safari also aborts the download when the object URL is
 * revoked in the same task as the click, so revocation is deferred.
 */
export function downloadJson(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
