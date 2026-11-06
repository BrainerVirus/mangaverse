import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@app/shared';
import type { PlatformAdapter } from '@app/platform';
import { createSqlJsHarness } from '@app/db/testing';

import { downscaleForDisplay } from './display-downscale.js';
import { resolvePageObjectUrl } from './page-cache-store.js';

/** A decoded image as the stubbed browser reports it. */
class FakeBitmap {
  closed = false;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}
  close(): void {
    this.closed = true;
  }
}

/** The canvas a stubbed browser encodes into; the bytes name the encoded size. */
class FakeCanvas {
  readonly drawn: unknown[] = [];
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    canvases.push(this);
  }
  getContext(): { drawImage: (image: unknown) => void } {
    return { drawImage: (image) => this.drawn.push(image) };
  }
  convertToBlob(options?: { type?: string; quality?: number }): Promise<Blob> {
    encodeCalls.push(options ?? {});
    if (encodeFails) return Promise.reject(new Error('encode failed'));
    return Promise.resolve(
      new Blob([`display ${this.width}x${this.height}`], { type: options?.type ?? 'image/png' }),
    );
  }
}

let sourceSize = { width: 0, height: 0 };
let encodeFails = false;
let canvases: FakeCanvas[] = [];
let encodeCalls: { type?: string; quality?: number }[] = [];
let bitmaps: FakeBitmap[] = [];
interface ResizeOptions {
  resizeWidth?: number;
  resizeHeight?: number;
  resizeQuality?: string;
}

const createImageBitmapStub = vi.fn<
  (source: Blob | FakeBitmap, options?: ResizeOptions) => Promise<FakeBitmap>
>(async (source, options) => {
  const bitmap =
    source instanceof Blob
      ? new FakeBitmap(sourceSize.width, sourceSize.height)
      : new FakeBitmap(
          options?.resizeWidth ?? source.width,
          options?.resizeHeight ?? source.height,
        );
  bitmaps.push(bitmap);
  return bitmap;
});

beforeEach(() => {
  sourceSize = { width: 0, height: 0 };
  encodeFails = false;
  canvases = [];
  encodeCalls = [];
  bitmaps = [];
  createImageBitmapStub.mockClear();
  vi.stubGlobal('createImageBitmap', createImageBitmapStub);
  vi.stubGlobal('OffscreenCanvas', FakeCanvas);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Bytes whose header declares no size, so only the decode reports `sourceSize`. */
const opaque = () => new Uint8Array([0xff, 0xd8, 0xff]).buffer;

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function png(width: number, height: number): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(33));
  view.setUint32(0, 0x89504e47);
  view.setUint32(4, 0x0d0a1a0a);
  view.setUint32(8, 13);
  writeAscii(view, 12, 'IHDR');
  view.setUint32(16, width);
  view.setUint32(20, height);
  return view.buffer;
}

/** SOI, an empty APP0 segment, then a baseline SOF0 frame. */
function jpeg(width: number, height: number): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(24));
  view.setUint16(0, 0xffd8);
  view.setUint16(2, 0xffe0);
  view.setUint16(4, 4);
  view.setUint16(8, 0xffc0);
  view.setUint16(10, 17);
  view.setUint8(12, 8);
  view.setUint16(13, height);
  view.setUint16(15, width);
  return view.buffer;
}

describe('downscaleForDisplay', () => {
  it('Given a 4000×6000 JPEG, When downscaled to 2048, Then a 1365×2048 JPEG comes back and both bitmaps are freed', async () => {
    sourceSize = { width: 4000, height: 6000 };

    const display = await downscaleForDisplay(opaque(), 'image/jpeg', 2048);

    expect(createImageBitmapStub).toHaveBeenCalledTimes(2);
    expect(createImageBitmapStub.mock.calls[1]?.[1]).toEqual({
      resizeWidth: 1365,
      resizeHeight: 2048,
      resizeQuality: 'high',
    });
    expect(canvases.map(({ width, height }) => ({ width, height }))).toEqual([
      { width: 1365, height: 2048 },
    ]);
    expect(canvases[0]?.drawn).toEqual([bitmaps[1]]);
    expect(encodeCalls).toEqual([{ type: 'image/jpeg', quality: 0.92 }]);
    expect(display?.type).toBe('image/jpeg');
    expect(await display?.text()).toBe('display 1365x2048');
    expect(bitmaps.every((bitmap) => bitmap.closed)).toBe(true);
  });

  it('Given a source the canvas cannot encode, When downscaled, Then the copy is a PNG', async () => {
    sourceSize = { width: 5000, height: 3000 };

    const display = await downscaleForDisplay(opaque(), 'image/gif', 2048);

    expect(encodeCalls).toEqual([{ type: 'image/png' }]);
    expect(display?.type).toBe('image/png');
  });

  it('Given a page within the cap, When downscaled, Then nothing is encoded and the original is kept', async () => {
    sourceSize = { width: 1600, height: 2048 };

    expect(await downscaleForDisplay(opaque(), 'image/jpeg', 2048)).toBeUndefined();
    expect(createImageBitmapStub).toHaveBeenCalledTimes(1);
    expect(canvases).toEqual([]);
    expect(bitmaps.every((bitmap) => bitmap.closed)).toBe(true);
  });

  it('Given a header that shows the page fits, When downscaled, Then it is not even decoded', async () => {
    expect(await downscaleForDisplay(png(1600, 2048), 'image/png', 2048)).toBeUndefined();
    expect(await downscaleForDisplay(jpeg(800, 12_000), 'image/jpeg', 2048)).toBeUndefined();
    expect(createImageBitmapStub).not.toHaveBeenCalled();
  });

  it('Given a header that shows the page is too large, When downscaled, Then the decoded size drives the copy', async () => {
    sourceSize = { width: 6000, height: 4000 };

    const display = await downscaleForDisplay(png(4000, 6000), 'image/png', 2048);

    expect(await display?.text()).toBe('display 2048x1365');
    expect(encodeCalls).toEqual([{ type: 'image/png' }]);
  });

  it('Given a decode, resize or encode failure, When downscaled, Then it gives up and frees what it decoded', async () => {
    sourceSize = { width: 4000, height: 6000 };
    createImageBitmapStub.mockRejectedValueOnce(new Error('not an image'));
    expect(await downscaleForDisplay(opaque(), 'image/jpeg', 2048)).toBeUndefined();

    encodeFails = true;
    expect(await downscaleForDisplay(opaque(), 'image/jpeg', 2048)).toBeUndefined();
    expect(bitmaps).toHaveLength(2);
    expect(bitmaps.every((bitmap) => bitmap.closed)).toBe(true);
  });

  it('Given a browser without createImageBitmap, When downscaled, Then the original is kept', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    sourceSize = { width: 4000, height: 6000 };

    expect(await downscaleForDisplay(opaque(), 'image/jpeg', 2048)).toBeUndefined();
  });
});

describe('page object URLs with a display cap', () => {
  const ORIGINAL = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

  /** A web-shaped adapter that records what is stored and what each URL is made from. */
  function createWebAdapter() {
    const blobs = new Map<string, { data: ArrayBuffer; mimeType: string }>();
    const puts: { key: string; data: ArrayBuffer; mimeType: string }[] = [];
    const urls: { data: ArrayBuffer; mimeType: string }[] = [];
    const adapter = {
      blobStorage: {
        put: async (key: string, data: ArrayBuffer, mimeType: string) => {
          puts.push({ key, data, mimeType });
          blobs.set(key, { data, mimeType });
          return ok(undefined);
        },
        get: async (key: string) => ok(blobs.get(key)),
        delete: async () => ok(undefined),
        createObjectUrl: async (data: ArrayBuffer, mimeType: string) => {
          urls.push({ data, mimeType });
          return ok(`blob:url-${urls.length}`);
        },
        revokeObjectUrl: async () => ok(undefined),
      },
      providerNetwork: {},
      network: {
        fetchBytes: async () => ok({ data: ORIGINAL.slice().buffer, mimeType: 'image/jpeg' }),
      },
    } as unknown as PlatformAdapter;
    return { adapter, blobs, puts, urls };
  }

  async function page(maxDisplayEdge: number | undefined) {
    const { db } = await createSqlJsHarness();
    const web = createWebAdapter();
    return {
      ...web,
      input: {
        db,
        adapter: web.adapter,
        providerId: 'mangadex',
        mangaId: 'manga-1',
        chapterId: 'chapter-1',
        pageIndex: 0,
        remoteUrl: 'https://uploads.mangadex.org/large.jpg',
        maxDisplayEdge,
      },
    };
  }

  const bytes = (buffer: ArrayBuffer | undefined) =>
    buffer === undefined ? [] : [...new Uint8Array(buffer)];
  const text = (buffer: ArrayBuffer | undefined) =>
    buffer === undefined ? '' : new TextDecoder().decode(buffer);

  it('Given Auto on a large page, When resolved fresh and from the cache, Then the URLs show a 2048 copy and the stored blob keeps the original bytes', async () => {
    sourceSize = { width: 4000, height: 6000 };
    const { input, puts, blobs, urls } = await page(2048);

    const fresh = await resolvePageObjectUrl(input);
    const cached = await resolvePageObjectUrl(input);

    expect(fresh).toMatchObject({ fromCache: false, byteSize: ORIGINAL.byteLength });
    expect(cached).toMatchObject({ fromCache: true, byteSize: ORIGINAL.byteLength });
    expect(urls.map((url) => [text(url.data), url.mimeType])).toEqual([
      ['display 1365x2048', 'image/jpeg'],
      ['display 1365x2048', 'image/jpeg'],
    ]);
    expect(puts).toHaveLength(1);
    expect(bytes(puts[0]?.data)).toEqual([...ORIGINAL]);
    expect(bytes([...blobs.values()][0]?.data)).toEqual([...ORIGINAL]);
  });

  it('Given Off, When a large page is resolved, Then no resize runs and the URL shows the stored bytes', async () => {
    sourceSize = { width: 4000, height: 6000 };
    const { input, urls } = await page(undefined);

    await resolvePageObjectUrl(input);

    expect(createImageBitmapStub).not.toHaveBeenCalled();
    expect(bytes(urls[0]?.data)).toEqual([...ORIGINAL]);
  });

  it('Given Auto on a small page, When resolved, Then the URL shows the stored bytes', async () => {
    sourceSize = { width: 1200, height: 1800 };
    const { input, urls } = await page(2048);

    await resolvePageObjectUrl(input);

    expect(bytes(urls[0]?.data)).toEqual([...ORIGINAL]);
    expect(urls[0]?.mimeType).toBe('image/jpeg');
  });

  it('Given Auto and a resize failure, When resolved, Then the URL falls back to the stored bytes', async () => {
    sourceSize = { width: 4000, height: 6000 };
    encodeFails = true;
    const { input, urls, puts } = await page(2048);

    const result = await resolvePageObjectUrl(input);

    expect(result?.objectUrl).toBe('blob:url-1');
    expect(bytes(urls[0]?.data)).toEqual([...ORIGINAL]);
    expect(bytes(puts[0]?.data)).toEqual([...ORIGINAL]);
  });
});
