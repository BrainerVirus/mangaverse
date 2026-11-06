import { displayDownscaleTarget, readImageSize } from '@app/shared';

/** Types the canvas can encode; anything else (GIF, AVIF) is shown as PNG. */
const ENCODABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const LOSSY_QUALITY = 0.92;

/**
 * A smaller copy of a page for display, or `undefined` when the page is shown as
 * is: it already fits, or the browser cannot decode, resize or encode it. A page
 * whose header shows it fits is not decoded at all. `data` is only read. Never
 * rejects: every failure shows the original instead.
 */
export async function downscaleForDisplay(
  data: ArrayBuffer,
  mimeType: string,
  maxEdge: number,
): Promise<Blob | undefined> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    return undefined;
  }
  const declared = readImageSize(data);
  if (
    declared !== undefined &&
    displayDownscaleTarget(declared.width, declared.height, maxEdge) === undefined
  ) {
    return undefined;
  }
  const decoded = await createImageBitmap(new Blob([data], { type: mimeType })).catch(
    () => undefined,
  );
  if (decoded === undefined) return undefined;
  const target = displayDownscaleTarget(decoded.width, decoded.height, maxEdge);
  if (target === undefined) {
    decoded.close();
    return undefined;
  }
  const resized = await createImageBitmap(decoded, {
    resizeWidth: target.width,
    resizeHeight: target.height,
    resizeQuality: 'high',
  }).catch(() => undefined);
  // The full-size bitmap is the memory this exists to save: free it before encoding.
  decoded.close();
  if (resized === undefined) return undefined;
  const encoded = await encodeBitmap(resized, mimeType).catch(() => undefined);
  resized.close();
  return encoded;
}

/** Encodes `bitmap` in the source's type where the canvas can, PNG otherwise. */
async function encodeBitmap(bitmap: ImageBitmap, mimeType: string): Promise<Blob | undefined> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  if (context === null) return undefined;
  context.drawImage(bitmap, 0, 0);
  const type = ENCODABLE_TYPES.has(mimeType) ? mimeType : 'image/png';
  return canvas.convertToBlob(type === 'image/png' ? { type } : { type, quality: LOSSY_QUALITY });
}
