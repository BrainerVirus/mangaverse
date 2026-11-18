import { describe, expect, it } from 'vitest';
import { panelSketchLayout, panelSketchPath } from '../components/panel-sketch-layout.js';

function inside(layout: ReturnType<typeof panelSketchLayout>): boolean {
  return layout.panels.every((panel) =>
    panel.points.every(([x, y]) => x >= 0 && x <= layout.width && y >= 0 && y <= layout.height),
  );
}

describe('panelSketchLayout', () => {
  it('Given the same seed and box, When laid out twice, Then the page is identical', () => {
    expect(panelSketchLayout('chapter-1:3', 420, 630)).toEqual(
      panelSketchLayout('chapter-1:3', 420, 630),
    );
  });

  it('Given the two pages of a spread, When laid out, Then they sketch differently', () => {
    const left = panelSketchLayout('chapter-1:4', 420, 630);
    const right = panelSketchLayout('chapter-1:5', 420, 630);
    expect(left.panels).not.toEqual(right.panels);
  });

  it.each([
    [420, 630],
    [518, 777],
    [300, 450],
    [1280, 900],
    [1600, 800],
  ])('Given a %dx%d page, Then three to five panels sit inside the box', (width, height) => {
    for (let index = 0; index < 40; index += 1) {
      const layout = panelSketchLayout(`chapter-1:${index}`, width, height);
      expect(layout.panels.length).toBeGreaterThanOrEqual(3);
      expect(layout.panels.length).toBeLessThanOrEqual(5);
      expect(inside(layout)).toBe(true);
      expect(layout.panels.some((panel) => panel.tone)).toBe(true);
    }
  });

  it('Given box shapes, Then portrait pages use rows, wide pages columns and tall strip rows stack', () => {
    expect(panelSketchLayout('s', 420, 630).kind).toBe('portrait');
    expect(panelSketchLayout('s', 1200, 700).kind).toBe('wide');
    const strip = panelSketchLayout('s', 800, 4000);
    expect(strip.kind).toBe('strip');
    expect(inside(strip)).toBe(true);
    // Stacked top to bottom: each panel starts below the previous one's top.
    const tops = strip.panels.map((panel) => Math.min(...panel.points.map(([, y]) => y)));
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    expect(strip.panels.length).toBeGreaterThanOrEqual(3);
    expect(strip.panels.length).toBeLessThanOrEqual(6);
  });

  it('Given one seed at two sizes of the same shape, Then the layout scales: same panels, same tones, inside each box', () => {
    const small = panelSketchLayout('chapter-9:0', 300, 450);
    const large = panelSketchLayout('chapter-9:0', 900, 1350);
    expect(large.panels.map((panel) => panel.tone)).toEqual(
      small.panels.map((panel) => panel.tone),
    );
    expect(inside(small)).toBe(true);
    expect(inside(large)).toBe(true);
    // Proportions hold within the margin and gutter, which keep a readable pixel size.
    const centre = (layout: typeof small, index: number) => {
      const points = layout.panels[index]!.points;
      return points.reduce((sum, [x]) => sum + x, 0) / points.length / layout.width;
    };
    for (let index = 0; index < small.panels.length; index += 1) {
      expect(Math.abs(centre(small, index) - centre(large, index))).toBeLessThan(0.05);
    }
  });

  it('Given an unmeasurable box, Then there is nothing to draw', () => {
    expect(panelSketchLayout('s', 0, 600).panels).toEqual([]);
    expect(panelSketchLayout('s', Number.NaN, 600).panels).toEqual([]);
  });

  it('Given a panel, Then its path closes the outline', () => {
    const [panel] = panelSketchLayout('s', 420, 630).panels;
    expect(panelSketchPath(panel!)).toMatch(/^M[\d.]+ [\d.]+( L[\d.]+ [\d.]+){3} Z$/);
  });
});
