import { describe, expect, it, vi } from 'vitest';

import {
  createDisplayCopyCache,
  resizePageForDisplay,
  type DisplayCopy,
  type PageImageCodec,
} from './page-display.js';

// The unit runner is Node, not Electron, so `nativeImage` is stubbed here; the Electron
// smoke drives the real one end to end.

/** A PNG header declaring `width` × `height`; enough for the header check. */
function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  bytes.writeUInt32BE(0x89504e47, 0);
  bytes.writeUInt32BE(0x0d0a1a0a, 4);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

/** Bytes no header reader recognises, so only the decode reports a size. */
const OPAQUE = Buffer.from([1, 2, 3, 4]);

function stubCodec(decoded: { width: number; height: number } | 'empty') {
  const resize = vi.fn<(options: { width: number; height: number; quality: 'good' }) => void>();
  const encoded = { jpeg: [] as number[], png: 0 };
  const createFromBuffer = vi.fn<PageImageCodec['createFromBuffer']>(() => ({
    isEmpty: () => decoded === 'empty',
    getSize: () => (decoded === 'empty' ? { width: 0, height: 0 } : decoded),
    resize: (options) => {
      resize(options);
      return {
        toJPEG: (quality) => {
          encoded.jpeg.push(quality);
          return Buffer.from(`jpeg ${options.width}x${options.height}`);
        },
        toPNG: () => {
          encoded.png += 1;
          return Buffer.from(`png ${options.width}x${options.height}`);
        },
      };
    },
  }));
  const codec: PageImageCodec = { createFromBuffer };
  return { codec, createFromBuffer, resize, encoded };
}

describe('resizePageForDisplay', () => {
  it('Given a 2400x3600 JPEG and a 2048 cap, When resized, Then a 1365x2048 JPEG at quality 92 comes back', () => {
    const { codec, resize, encoded } = stubCodec({ width: 2400, height: 3600 });

    const copy = resizePageForDisplay(codec, OPAQUE, 'image/jpeg', 2048);

    expect(resize).toHaveBeenCalledWith({ width: 1365, height: 2048, quality: 'good' });
    expect(encoded.jpeg).toEqual([92]);
    expect(copy).toEqual({ bytes: Buffer.from('jpeg 1365x2048'), mimeType: 'image/jpeg' });
  });

  it('Given a landscape PNG or a decodable WebP, When resized, Then the copy is a PNG', () => {
    const png = stubCodec({ width: 6000, height: 4000 });
    expect(resizePageForDisplay(png.codec, OPAQUE, 'image/png', 2048)).toEqual({
      bytes: Buffer.from('png 2048x1365'),
      mimeType: 'image/png',
    });

    const webp = stubCodec({ width: 6000, height: 4000 });
    expect(resizePageForDisplay(webp.codec, OPAQUE, 'image/webp', 2048)?.mimeType).toBe(
      'image/png',
    );
  });

  it('Given a header that shows the page fits, When resized, Then it is not decoded at all', () => {
    const { codec, createFromBuffer } = stubCodec({ width: 1600, height: 2048 });

    expect(resizePageForDisplay(codec, pngHeader(1600, 2048), 'image/png', 2048)).toBeUndefined();
    expect(resizePageForDisplay(codec, pngHeader(800, 12_000), 'image/png', 2048)).toBeUndefined();
    expect(createFromBuffer).not.toHaveBeenCalled();
  });

  it('Given an image nativeImage cannot decode, or one that fits once decoded, When resized, Then the original is served', () => {
    const empty = stubCodec('empty');
    expect(resizePageForDisplay(empty.codec, OPAQUE, 'image/avif', 2048)).toBeUndefined();
    expect(empty.resize).not.toHaveBeenCalled();

    const small = stubCodec({ width: 1200, height: 1800 });
    expect(resizePageForDisplay(small.codec, OPAQUE, 'image/jpeg', 2048)).toBeUndefined();
    expect(small.resize).not.toHaveBeenCalled();
  });

  it('Given an encode that produces nothing, When resized, Then the original is served', () => {
    const codec: PageImageCodec = {
      createFromBuffer: () => ({
        isEmpty: () => false,
        getSize: () => ({ width: 4000, height: 6000 }),
        resize: () => ({ toJPEG: () => Buffer.alloc(0), toPNG: () => Buffer.alloc(0) }),
      }),
    };

    expect(resizePageForDisplay(codec, OPAQUE, 'image/jpeg', 2048)).toBeUndefined();
  });
});

const copyOf = (size: number): DisplayCopy => ({
  bytes: Buffer.alloc(size),
  mimeType: 'image/jpeg',
});

describe('createDisplayCopyCache', () => {
  it('Given one key asked twice, concurrently and later, When cached, Then the copy is made once', async () => {
    const cache = createDisplayCopyCache();
    const make = vi.fn<() => Promise<DisplayCopy | undefined>>(async () => copyOf(10));

    const [first, second] = await Promise.all([
      cache.get('a:2048', make),
      cache.get('a:2048', make),
    ]);
    const third = await cache.get('a:2048', make);

    expect(make).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(third).toBe(first);
  });

  it('Given the same page under two caps, When cached, Then each cap is its own entry', async () => {
    const cache = createDisplayCopyCache();

    const small = await cache.get('a:1024', async () => copyOf(5));
    const large = await cache.get('a:2048', async () => copyOf(9));

    expect(small?.bytes.byteLength).toBe(5);
    expect(large?.bytes.byteLength).toBe(9);
    expect(cache.usage()).toEqual({ entries: 2, bytes: 14 });
  });

  it('Given more entries than the cap, When cached, Then the least recently used one is evicted', async () => {
    const cache = createDisplayCopyCache({ maxEntries: 2 });
    const make = vi.fn<() => Promise<DisplayCopy | undefined>>(async () => copyOf(1));

    await cache.get('a', make);
    await cache.get('b', make);
    await cache.get('a', make); // a is now the most recent
    await cache.get('c', make); // evicts b
    expect(make).toHaveBeenCalledTimes(3);

    await cache.get('a', make);
    expect(make).toHaveBeenCalledTimes(3);
    await cache.get('b', make);
    expect(make).toHaveBeenCalledTimes(4);
    expect(cache.usage().entries).toBe(2);
  });

  it('Given more bytes than the budget, When cached, Then old copies go and an oversized one is served but not kept', async () => {
    const cache = createDisplayCopyCache({ maxBytes: 10 });

    await cache.get('a', async () => copyOf(6));
    await cache.get('b', async () => copyOf(6));
    expect(cache.usage()).toEqual({ entries: 1, bytes: 6 });

    const huge = await cache.get('c', async () => copyOf(11));
    expect(huge?.bytes.byteLength).toBe(11);
    expect(cache.usage()).toEqual({ entries: 1, bytes: 6 });
  });

  it('Given a make that fails or keeps the original, When asked again, Then the original answer is remembered without remaking', async () => {
    const cache = createDisplayCopyCache();
    const failing = vi.fn<() => Promise<DisplayCopy | undefined>>(async () => {
      throw new Error('decode failed');
    });

    expect(await cache.get('broken', failing)).toBeUndefined();
    expect(await cache.get('broken', failing)).toBeUndefined();
    expect(failing).toHaveBeenCalledTimes(1);
    expect(cache.usage()).toEqual({ entries: 1, bytes: 0 });
  });
});
