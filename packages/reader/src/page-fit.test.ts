import { describe, expect, it } from 'vitest';
import { resolvePageFit } from './page-fit.js';

const area = {
  availableWidth: 900,
  availableHeight: 600,
  pageCount: 1,
};

describe('resolvePageFit', () => {
  it('Given fit width, When resolved, Then the box spans the width and the height follows the page ratio', () => {
    const fit = resolvePageFit({ ...area, fitMode: 'width' });

    expect(fit.box.width).toBe(900);
    expect(fit.box.height).toBeCloseTo(1350, 5);
  });

  it('Given fit height, When resolved, Then the box spans the height and the width follows the page ratio', () => {
    const fit = resolvePageFit({ ...area, fitMode: 'height' });

    expect(fit.box.height).toBe(600);
    expect(fit.box.width).toBeCloseTo(400, 5);
  });

  it('Given fit contain, When resolved, Then the whole page fits inside the available area', () => {
    const fit = resolvePageFit({ ...area, fitMode: 'contain' });

    expect(fit.box.width).toBeLessThanOrEqual(area.availableWidth);
    expect(fit.box.height).toBeLessThanOrEqual(area.availableHeight);
    expect(fit.box.width / fit.box.height).toBeCloseTo(2 / 3, 5);
  });

  it('Given fit cover, When resolved, Then the box fills the available area and the image crops', () => {
    const fit = resolvePageFit({ ...area, fitMode: 'cover' });

    expect(fit.box).toEqual({ width: 900, height: 600 });
    expect(fit.objectFit).toBe('cover');
  });

  it('Given a page whose intrinsic size is known, When fit original, Then the box is the natural size', () => {
    const fit = resolvePageFit({
      ...area,
      fitMode: 'original',
      naturalSize: { width: 300, height: 450 },
    });

    expect(fit.box).toEqual({ width: 300, height: 450 });
    expect(fit.objectFit).toBe('none');
  });

  it('Given a natural page larger than the area, When fit original, Then the box shrinks to fit without cropping', () => {
    const fit = resolvePageFit({
      ...area,
      fitMode: 'original',
      naturalSize: { width: 1800, height: 2700 },
    });

    expect(fit.box.width).toBeLessThanOrEqual(area.availableWidth);
    expect(fit.box.height).toBeLessThanOrEqual(area.availableHeight);
    expect(fit.box.width / fit.box.height).toBeCloseTo(2 / 3, 5);
  });

  it('Given a spread of two pages, When fit width, Then each page gets half the width', () => {
    const fit = resolvePageFit({ ...area, fitMode: 'width', pageCount: 2 });

    expect(fit.box.width).toBe(450);
  });

  it('Given a 2:1 page and a 900x600 area, When each fit mode resolves, Then the boxes are the documented geometry', () => {
    const modes = ['width', 'height', 'contain', 'cover', 'original'] as const;
    const source = { width: 600, height: 300 };
    const rendered = modes.map((fitMode) => {
      const fit = resolvePageFit({ ...area, fitMode, naturalSize: source });
      return `${fit.box.width}x${fit.box.height}:${fit.objectFit}`;
    });

    expect(rendered).toEqual([
      '900x450:contain', // width: spans the width, ratio drives the height
      '1200x600:contain', // height: spans the height, ratio drives the width
      '900x450:contain', // contain: fits inside, may coincide with width
      '900x600:cover', // cover: fills the area
      '600x300:none', // original: the natural size
    ]);
  });

  it('Given a page narrower than the area, When fit contain, Then the box is bounded by the height', () => {
    const contain = resolvePageFit({ ...area, fitMode: 'contain' });

    // Portrait fallback ratio 2:3: the height binds, so the width is 400.
    expect(contain.box).toEqual({ width: 400, height: 600 });
  });

  it('Given a page wider than it is tall, When fit contain, Then the box is letterboxed by the width', () => {
    const wide = resolvePageFit({
      availableWidth: 900,
      availableHeight: 600,
      pageCount: 1,
      fitMode: 'contain',
      naturalSize: { width: 1600, height: 600 },
    });

    expect(wide.box).toEqual({ width: 900, height: 337.5 });
  });

  it('Given a provider that did not report a page size, When resolved, Then a portrait ratio is assumed', () => {
    const fit = resolvePageFit({ ...area, fitMode: 'width' });

    expect(fit.box.height).toBeCloseTo(1350, 5);
  });

  it('Given fit width for a portrait page, When resolved, Then the box is taller than the area by design', () => {
    const fit = resolvePageFit({ ...area, fitMode: 'width' });

    // Width-first is what the user asked for: the page is read by scrolling.
    expect(fit.box.height).toBeGreaterThan(area.availableHeight);
  });
});
