import { displayDownscaleTarget, readImageSize } from '@app/shared';

// Display downscale on desktop (spec 07). The renderer never holds page bytes (X13), so a
// `page://…?display=<cap>` request is answered here with a smaller copy made by Electron's
// `nativeImage`. The stored page is only read; the copy lives in a bounded in-memory cache.

/** What the resize uses of Electron's `nativeImage`; the unit runner has no Electron. */
export interface PageImageCodec {
  createFromBuffer(buffer: Buffer): {
    isEmpty(): boolean;
    getSize(): { width: number; height: number };
    resize(options: { width: number; height: number; quality: 'good' }): {
      toJPEG(quality: number): Buffer;
      toPNG(): Buffer;
    };
  };
}

export interface DisplayCopy {
  readonly bytes: Buffer;
  readonly mimeType: string;
}

const JPEG_QUALITY = 92;

/**
 * A copy of a stored page at the cap, or `undefined` to serve the original: it fits,
 * `nativeImage` cannot decode it, or encoding produced nothing. A page whose header shows
 * it fits is not decoded. JPEG stays JPEG; every other decodable type is encoded as PNG,
 * since `nativeImage` writes only those two.
 */
export function resizePageForDisplay(
  codec: PageImageCodec,
  bytes: Buffer,
  mimeType: string,
  maxEdge: number,
): DisplayCopy | undefined {
  const declared = readImageSize(bytes);
  if (
    declared !== undefined &&
    displayDownscaleTarget(declared.width, declared.height, maxEdge) === undefined
  ) {
    return undefined;
  }
  const image = codec.createFromBuffer(bytes);
  if (image.isEmpty()) return undefined;
  const size = image.getSize();
  const target = displayDownscaleTarget(size.width, size.height, maxEdge);
  if (target === undefined) return undefined;
  const resized = image.resize({ width: target.width, height: target.height, quality: 'good' });
  const jpeg = mimeType === 'image/jpeg';
  const encoded = jpeg ? resized.toJPEG(JPEG_QUALITY) : resized.toPNG();
  if (encoded.byteLength === 0) return undefined;
  return { bytes: encoded, mimeType: jpeg ? 'image/jpeg' : 'image/png' };
}

export interface DisplayCopyCache {
  /**
   * The copy cached under `key`, else the one `make` produces; concurrent asks for one key
   * share a single `make`. `undefined` means serve the original, and is remembered too, so
   * a page that fits or cannot be decoded is not decoded again.
   */
  get(key: string, make: () => Promise<DisplayCopy | undefined>): Promise<DisplayCopy | undefined>;
  /** What the cache holds now, for tests and diagnostics. */
  usage(): { readonly entries: number; readonly bytes: number };
}

/** 32 copies at a 2048px cap are a few tens of MB of encoded bytes; this bounds the worst case. */
const DISPLAY_COPY_CACHE_MAX_ENTRIES = 32;
const DISPLAY_COPY_CACHE_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Least recently used first out, bounded by both entries and bytes. A copy larger than the
 * whole byte budget is served but not kept.
 */
export function createDisplayCopyCache(
  options: { readonly maxEntries?: number; readonly maxBytes?: number } = {},
): DisplayCopyCache {
  const maxEntries = options.maxEntries ?? DISPLAY_COPY_CACHE_MAX_ENTRIES;
  const maxBytes = options.maxBytes ?? DISPLAY_COPY_CACHE_MAX_BYTES;
  // Map order is the recency order: a hit is re-inserted at the end.
  const entries = new Map<string, DisplayCopy | null>();
  const pending = new Map<string, Promise<DisplayCopy | undefined>>();
  let bytes = 0;

  const cost = (copy: DisplayCopy | null) => copy?.bytes.byteLength ?? 0;
  const store = (key: string, copy: DisplayCopy | null) => {
    if (cost(copy) > maxBytes) return;
    entries.set(key, copy);
    bytes += cost(copy);
    for (const [oldest, value] of entries) {
      if (entries.size <= maxEntries && bytes <= maxBytes) break;
      entries.delete(oldest);
      bytes -= cost(value);
    }
  };

  return {
    get(key, make) {
      if (entries.has(key)) {
        const copy = entries.get(key) ?? null;
        entries.delete(key);
        entries.set(key, copy);
        return Promise.resolve(copy ?? undefined);
      }
      const inFlight = pending.get(key);
      if (inFlight !== undefined) return inFlight;
      const made = make()
        .catch(() => undefined)
        .then((copy) => {
          store(key, copy ?? null);
          return copy;
        })
        .finally(() => pending.delete(key));
      pending.set(key, made);
      return made;
    },
    usage: () => ({ entries: entries.size, bytes }),
  };
}
