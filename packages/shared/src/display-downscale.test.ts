import { describe, expect, it } from 'vitest';

import { clampDisplayMaxEdge, displayDownscaleTarget, readImageSize } from './display-downscale.js';

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

function gif(width: number, height: number): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(13));
  writeAscii(view, 0, 'GIF89a');
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return view.buffer;
}

function webpExtended(width: number, height: number): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(30));
  writeAscii(view, 0, 'RIFF');
  writeAscii(view, 8, 'WEBP');
  writeAscii(view, 12, 'VP8X');
  const uint24 = (offset: number, value: number) => {
    view.setUint16(offset, value & 0xffff, true);
    view.setUint8(offset + 2, value >> 16);
  };
  uint24(24, width - 1);
  uint24(27, height - 1);
  return view.buffer;
}

describe('readImageSize', () => {
  it('Given PNG, JPEG, GIF and WebP headers, When read, Then the declared size comes back', () => {
    expect(readImageSize(png(4000, 6000))).toEqual({ width: 4000, height: 6000 });
    expect(readImageSize(jpeg(1600, 2400))).toEqual({ width: 1600, height: 2400 });
    expect(readImageSize(gif(300, 200))).toEqual({ width: 300, height: 200 });
    expect(readImageSize(webpExtended(5000, 3000))).toEqual({ width: 5000, height: 3000 });
  });

  it('Given an unknown or truncated file, When read, Then no size is claimed', () => {
    expect(readImageSize(opaque())).toBeUndefined();
    expect(readImageSize(new TextEncoder().encode('<svg width="9000"/>').buffer)).toBeUndefined();
    expect(readImageSize(new ArrayBuffer(0))).toBeUndefined();
    expect(readImageSize(png(4000, 6000).slice(0, 20))).toBeUndefined();
  });
});

describe('displayDownscaleTarget', () => {
  it('Given a page larger than the cap, When planned, Then its long edge is capped with the aspect ratio kept', () => {
    expect(displayDownscaleTarget(4000, 6000, 2048)).toEqual({ width: 1365, height: 2048 });
    expect(displayDownscaleTarget(6000, 4000, 2048)).toEqual({ width: 2048, height: 1365 });
    expect(displayDownscaleTarget(3000, 3000, 2048)).toEqual({ width: 2048, height: 2048 });
  });

  it('Given a page at most the cap on both edges, When planned, Then it is shown as is', () => {
    expect(displayDownscaleTarget(2048, 2048, 2048)).toBeUndefined();
    expect(displayDownscaleTarget(1200, 1800, 2048)).toBeUndefined();
    expect(displayDownscaleTarget(1, 1, 2048)).toBeUndefined();
  });

  it('Given a webtoon strip, When planned, Then its width is never narrowed below half the cap', () => {
    // An 800px-wide strip keeps every pixel: capping its 12000px length would leave it 136px wide.
    expect(displayDownscaleTarget(800, 12_000, 2048)).toBeUndefined();
    // An oversized strip shrinks only to the 1024px floor.
    expect(displayDownscaleTarget(3000, 12_000, 2048)).toEqual({ width: 1024, height: 4096 });
  });

  it('Given an unknown size or no cap, When planned, Then nothing is resized', () => {
    expect(displayDownscaleTarget(0, 6000, 2048)).toBeUndefined();
    expect(displayDownscaleTarget(4000, 6000, 0)).toBeUndefined();
    expect(displayDownscaleTarget(Number.NaN, 6000, 2048)).toBeUndefined();
  });
});

describe('readImageSize on a view', () => {
  it('Given bytes inside a larger buffer (a Node Buffer slice), When read, Then the view offset is honoured', () => {
    const padded = new Uint8Array(3 + 33);
    padded.set(new Uint8Array(png(2400, 3600)), 3);

    expect(readImageSize(padded.subarray(3))).toEqual({ width: 2400, height: 3600 });
  });
});

describe('clampDisplayMaxEdge', () => {
  it('Given a cap outside 256-4096 or fractional, When clamped, Then it lands in range as whole pixels', () => {
    expect(clampDisplayMaxEdge(2048)).toBe(2048);
    expect(clampDisplayMaxEdge(1)).toBe(256);
    expect(clampDisplayMaxEdge(99_999)).toBe(4096);
    expect(clampDisplayMaxEdge(2047.6)).toBe(2048);
    expect(clampDisplayMaxEdge(Number.NaN)).toBe(4096);
  });
});
