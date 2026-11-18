/** A point in the sketch's own pixel space (the page box it stands in for). */
type SketchPoint = readonly [x: number, y: number];

export interface SketchPanel {
  /** The panel outline, clockwise from the top left. */
  readonly points: readonly SketchPoint[];
  /** Whether a screentone fills the panel once its border is drawn. */
  readonly tone: boolean;
}

type PanelSketchKind = 'portrait' | 'wide' | 'strip';

export interface PanelSketchLayout {
  readonly kind: PanelSketchKind;
  readonly width: number;
  readonly height: number;
  readonly panels: readonly SketchPanel[];
}

/** From this height/width ratio a box is a strip row: panels stack like a webtoon. */
const STRIP_RATIO = 2.4;
/** Below this height/width ratio a box is a wide page (a landscape spread). */
const WIDE_RATIO = 0.85;
/** The most panels a tall strip row stacks, however tall it is. */
const MAX_STRIP_PANELS = 6;

/** FNV-1a: a stable 32-bit hash of the seed. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: a small seeded generator, so a seed always yields the same page. */
function seededRandom(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Splits `length` into parts proportional to random weights, keeping each part readable. */
function split(random: () => number, length: number, parts: number, gutter: number): number[] {
  const weights = Array.from({ length: parts }, () => 0.7 + random() * 0.8);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const usable = length - gutter * (parts - 1);
  return weights.map((weight) => (usable * weight) / total);
}

interface Row {
  readonly top: number;
  readonly bottom: number;
}

/**
 * One row of panels between `left` and `right`. Two panels may share a
 * diagonal cut: the divider leans by `lean`, and each side keeps half the
 * gutter from it.
 */
function rowPanels(
  random: () => number,
  row: Row,
  left: number,
  right: number,
  count: number,
  gutter: number,
): SketchPoint[][] {
  if (count === 1) {
    return [
      [
        [left, row.top],
        [right, row.top],
        [right, row.bottom],
        [left, row.bottom],
      ],
    ];
  }
  const widths = split(random, right - left, count, gutter);
  const lean = count === 2 && random() < 0.4 ? (random() - 0.5) * (right - left) * 0.3 : 0;
  const panels: SketchPoint[][] = [];
  let x = left;
  widths.forEach((width, index) => {
    const start = x;
    const end = x + width;
    const leanStart = index === 0 ? 0 : lean;
    const leanEnd = index === count - 1 ? 0 : lean;
    panels.push([
      [start + leanStart, row.top],
      [end + leanEnd, row.top],
      [end - leanEnd, row.bottom],
      [start - leanStart, row.bottom],
    ]);
    x = end + gutter;
  });
  return panels;
}

function portraitPanels(
  random: () => number,
  box: Row & { left: number; right: number },
  gutter: number,
): SketchPoint[][] {
  const rowCount = random() < 0.5 ? 2 : 3;
  const heights = split(random, box.bottom - box.top, rowCount, gutter);
  // Three to five panels: one or two per row, at least one row split.
  const counts: number[] = heights.map(() => (random() < 0.55 ? 2 : 1));
  if (counts.every((count) => count < 2)) counts[Math.floor(random() * rowCount)] = 2;
  while (counts.reduce((sum, count) => sum + count, 0) > 5) counts[counts.indexOf(2)] = 1;
  const panels: SketchPoint[][] = [];
  let y = box.top;
  heights.forEach((height, index) => {
    const row = { top: y, bottom: y + height };
    panels.push(...rowPanels(random, row, box.left, box.right, counts[index] ?? 1, gutter));
    y += height + gutter;
  });
  return panels;
}

/** A wide page reads in columns; one column splits into two or three stacked panels. */
function widePanels(
  random: () => number,
  box: Row & { left: number; right: number },
  gutter: number,
): SketchPoint[][] {
  const columnCount = random() < 0.5 ? 2 : 3;
  const widths = split(random, box.right - box.left, columnCount, gutter);
  const stacked = Math.floor(random() * columnCount);
  const panels: SketchPoint[][] = [];
  let x = box.left;
  widths.forEach((width, index) => {
    const right = x + width;
    const rows = index === stacked ? (columnCount === 2 ? 3 : 2) : 1;
    const heights = split(random, box.bottom - box.top, rows, gutter);
    let y = box.top;
    for (const height of heights) {
      panels.push([
        [x, y],
        [right, y],
        [right, y + height],
        [x, y + height],
      ]);
      y += height + gutter;
    }
    x = right + gutter;
  });
  return panels;
}

/**
 * A tall strip row stacks panels down the column like a webtoon: wide gaps,
 * some panels narrower and set to one side, an occasional slanted foot.
 */
function stripPanels(
  random: () => number,
  box: Row & { left: number; right: number },
  gutter: number,
  ratio: number,
): SketchPoint[][] {
  const count = clamp(Math.round(ratio * 0.9), 3, MAX_STRIP_PANELS);
  const gap = gutter * 4;
  const heights = split(random, box.bottom - box.top, count, gap);
  const width = box.right - box.left;
  const panels: SketchPoint[][] = [];
  let y = box.top;
  for (const height of heights) {
    const narrow = random() < 0.4;
    const panelWidth = narrow ? width * (0.6 + random() * 0.2) : width;
    const left = narrow && random() < 0.5 ? box.right - panelWidth : box.left;
    const slant = random() < 0.3 ? (random() - 0.5) * height * 0.25 : 0;
    panels.push([
      [left, y],
      [left + panelWidth, y],
      [left + panelWidth, y + height - Math.max(0, slant)],
      [left, y + height + Math.min(0, slant)],
    ]);
    y += height + gap;
  }
  return panels;
}

/**
 * A manga page layout for a placeholder, drawn in the box's own pixels so the
 * ink keeps one weight at any size. The seed (a chapter and page index) picks
 * every choice, so a page always sketches the same way and the two pages of a
 * spread differ. The box shape picks the kind: a portrait page of three to
 * five panels in rows, a wide page in columns, or a tall strip row stacked.
 */
export function panelSketchLayout(seed: string, width: number, height: number): PanelSketchLayout {
  const valid = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  const ratio = valid ? height / width : 1;
  const kind: PanelSketchKind =
    ratio >= STRIP_RATIO ? 'strip' : ratio < WIDE_RATIO ? 'wide' : 'portrait';
  if (!valid) return { kind, width: 0, height: 0, panels: [] };

  const random = seededRandom(seed);
  const short = Math.min(width, height);
  const gutter = clamp(short * 0.03, 3, 14);
  const margin = clamp(short * 0.07, 6, 40);
  const box = { left: margin, right: width - margin, top: margin, bottom: height - margin };
  const outlines =
    kind === 'strip'
      ? stripPanels(random, box, gutter, ratio)
      : kind === 'wide'
        ? widePanels(random, box, gutter)
        : portraitPanels(random, box, gutter);

  // One or two panels take a screentone.
  const toned = new Set<number>();
  const toneCount = outlines.length > 3 ? 2 : 1;
  while (toned.size < toneCount) toned.add(Math.floor(random() * outlines.length));

  return {
    kind,
    width,
    height,
    panels: outlines.map((points, index) => ({
      points: points.map(([x, y]) => [round(x), round(y)] as const),
      tone: toned.has(index),
    })),
  };
}

/** An SVG path for a panel outline. */
export function panelSketchPath(panel: SketchPanel): string {
  return `${panel.points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')} Z`;
}
