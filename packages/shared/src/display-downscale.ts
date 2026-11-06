// Display downscale (spec 07): the size a reader page is shown at under a long-edge cap.
// Pure, so the web cache and desktop main compute the same target and never disagree.

/** The smallest and largest cap main accepts on a `page://` display request, in pixels. */
export const DISPLAY_DOWNSCALE_MIN_EDGE_PX = 256;
export const DISPLAY_DOWNSCALE_MAX_EDGE_PX = 4096;

/** The `page://` query parameter that asks main for a display copy at a cap. */
export const DISPLAY_DOWNSCALE_QUERY = 'display';

/**
 * Display downscale never narrows a page's short edge below this share of the
 * cap. A webtoon strip is a few hundred pixels wide and thousands tall: capping
 * its long edge alone would leave it a sliver too narrow to read, so a strip
 * keeps its width and only an oversized one shrinks, to this floor.
 */
const SHORT_EDGE_FLOOR_RATIO = 0.5;

export interface DisplaySize {
  readonly width: number;
  readonly height: number;
}

/** A requested cap brought into the range main serves, as a whole number of pixels. */
export function clampDisplayMaxEdge(maxEdge: number): number {
  if (!Number.isFinite(maxEdge)) return DISPLAY_DOWNSCALE_MAX_EDGE_PX;
  return Math.min(
    DISPLAY_DOWNSCALE_MAX_EDGE_PX,
    Math.max(DISPLAY_DOWNSCALE_MIN_EDGE_PX, Math.round(maxEdge)),
  );
}

/**
 * The size a `width` × `height` page is shown at under a `maxEdge` cap, or
 * `undefined` when it is shown as is. The aspect ratio is kept; the long edge
 * is capped at `maxEdge` unless that would narrow the short edge below
 * `maxEdge * SHORT_EDGE_FLOOR_RATIO`, in which case the floor wins.
 */
export function displayDownscaleTarget(
  width: number,
  height: number,
  maxEdge: number,
): DisplaySize | undefined {
  if (!(width > 0 && height > 0 && maxEdge > 0)) return undefined;
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const capScale = maxEdge / longEdge;
  const floorScale = Math.min(1, (maxEdge * SHORT_EDGE_FLOOR_RATIO) / shortEdge);
  const scale = Math.max(capScale, floorScale);
  if (scale >= 1) return undefined;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * The pixel size a JPEG, PNG, GIF or WebP header declares, read without a
 * decode; `undefined` for any other or malformed file. EXIF orientation is
 * ignored: swapping the edges does not change the long one.
 */
export function readImageSize(data: ArrayBuffer | ArrayBufferView): DisplaySize | undefined {
  const view = ArrayBuffer.isView(data)
    ? new DataView(data.buffer, data.byteOffset, data.byteLength)
    : new DataView(data);
  const length = view.byteLength;
  const hasAscii = (offset: number, text: string) => {
    if (offset + text.length > length) return false;
    for (let index = 0; index < text.length; index += 1) {
      if (view.getUint8(offset + index) !== text.charCodeAt(index)) return false;
    }
    return true;
  };
  const size = (width: number, height: number) =>
    width > 0 && height > 0 ? { width, height } : undefined;

  if (length >= 24 && view.getUint32(0) === 0x89504e47 && hasAscii(12, 'IHDR')) {
    return size(view.getUint32(16), view.getUint32(20));
  }
  if (length >= 10 && hasAscii(0, 'GIF8')) {
    return size(view.getUint16(6, true), view.getUint16(8, true));
  }
  if (length >= 30 && hasAscii(0, 'RIFF') && hasAscii(8, 'WEBP')) {
    if (hasAscii(12, 'VP8 ')) {
      return size(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    }
    if (hasAscii(12, 'VP8L')) {
      const bits = view.getUint32(21, true);
      return size((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    if (hasAscii(12, 'VP8X')) {
      const uint24 = (offset: number) =>
        view.getUint16(offset, true) + (view.getUint8(offset + 2) << 16);
      return size(uint24(24) + 1, uint24(27) + 1);
    }
    return undefined;
  }
  if (length >= 4 && view.getUint16(0) === 0xffd8) return readJpegSize(view);
  return undefined;
}

/** Walks the JPEG segments to the first start-of-frame marker. */
function readJpegSize(view: DataView): DisplaySize | undefined {
  let offset = 2;
  while (offset + 9 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return undefined;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    // A scan or the end of the image before any frame: there is no size to read.
    if (marker === 0xda || marker === 0xd9) return undefined;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = view.getUint16(offset + 5);
      const width = view.getUint16(offset + 7);
      return width > 0 && height > 0 ? { width, height } : undefined;
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  return undefined;
}
