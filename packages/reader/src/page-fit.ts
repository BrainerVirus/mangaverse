import type { ResolvedFitMode } from './resolve-reader-settings.js';

export interface PageFitInput {
  readonly fitMode: ResolvedFitMode;
  /** Area the paged view may use, in CSS pixels (viewport minus chrome insets). */
  readonly availableWidth: number;
  readonly availableHeight: number;
  /** Pages rendered side by side (a spread); each gets a share of the width. */
  readonly pageCount: number;
  /** Intrinsic page size (CSS pixels) when the source reports it. */
  readonly naturalSize?: { readonly width: number; readonly height: number } | undefined;
}

/** The strip's per-page box and the object-fit that fills it. */
export interface StripPageFit {
  readonly box: {
    readonly width: number;
    readonly height: number;
  };
  readonly objectFit: 'contain' | 'cover' | 'none';
}

export interface StripFitInput {
  readonly fitMode: ResolvedFitMode;
  /** The rendered strip column width, in CSS pixels. */
  readonly stripWidth: number;
  /** The strip viewport height, in CSS pixels; the height-limited modes use it. */
  readonly viewportHeight: number;
  /** Width / height of the page (or the best known fallback). */
  readonly aspectRatio: number;
  /** Intrinsic page size when the source reports it; Original size uses it. */
  readonly naturalSize?: { readonly width: number; readonly height: number } | undefined;
}

/**
 * The strip's documented fit semantics. Auto resolves to `width` before this
 * runs (spec R6), so an explicit choice always changes the row geometry:
 * width spans the column, height spans the viewport, contain fits both,
 * cover fills both and crops, and original keeps the natural size. A page
 * narrower than the column stays centred.
 */
export function resolveStripPageFit(input: StripFitInput): StripPageFit {
  const stripWidth = Math.max(0, input.stripWidth);
  const viewportHeight = Math.max(0, input.viewportHeight);
  const aspectRatio = normalizeAspectRatio(input.aspectRatio);
  const natural = normalizeNaturalSize(input.naturalSize);

  switch (input.fitMode) {
    case 'height':
      return {
        box: { width: viewportHeight * aspectRatio, height: viewportHeight },
        objectFit: 'contain',
      };
    case 'contain': {
      const width = Math.min(stripWidth, viewportHeight * aspectRatio);
      return { box: { width, height: width / aspectRatio }, objectFit: 'contain' };
    }
    case 'cover':
      return {
        box: { width: stripWidth, height: viewportHeight },
        objectFit: 'cover',
      };
    case 'original': {
      const width = natural?.width ?? stripWidth;
      const height = natural?.height ?? width / aspectRatio;
      return { box: { width, height }, objectFit: 'none' };
    }
    case 'width':
    default:
      return {
        box: { width: stripWidth, height: stripWidth / aspectRatio },
        objectFit: 'contain',
      };
  }
}

function normalizeAspectRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return DEFAULT_ASPECT_RATIO;
  return ratio;
}

export interface PageFit {
  /** Inline box for one page wrapper, in CSS pixels. */
  readonly box: {
    readonly width: number;
    readonly height: number;
  };
  /** How the image scales inside the box. */
  readonly objectFit: 'contain' | 'cover' | 'none';
}

/** Portrait fallback for pages whose intrinsic size the provider did not report. */
const DEFAULT_ASPECT_RATIO = 2 / 3;

/**
 * Maps a fit mode to the page box in the paged view. The box is what the
 * settings control claims to change, so each mode yields a distinct size:
 * width/height stretch one axis and let the page ratio drive the other, contain
 * fits inside the area, cover fills it, and original stops at the natural size.
 */
export function resolvePageFit(input: PageFitInput): PageFit {
  const pages = Math.max(1, input.pageCount);
  const availableWidth = Math.max(0, input.availableWidth) / pages;
  const availableHeight = Math.max(0, input.availableHeight);
  const natural = normalizeNaturalSize(input.naturalSize);
  const aspectRatio = natural !== undefined ? natural.width / natural.height : DEFAULT_ASPECT_RATIO;

  switch (input.fitMode) {
    case 'height':
      return {
        box: { width: availableHeight * aspectRatio, height: availableHeight },
        objectFit: 'contain',
      };
    case 'contain': {
      const width = Math.min(availableWidth, availableHeight * aspectRatio);
      return { box: { width, height: width / aspectRatio }, objectFit: 'contain' };
    }
    case 'cover':
      return { box: { width: availableWidth, height: availableHeight }, objectFit: 'cover' };
    case 'original': {
      const naturalWidth = natural?.width ?? availableWidth;
      const naturalHeight = natural?.height ?? naturalWidth / aspectRatio;
      return {
        box: { width: naturalWidth, height: naturalHeight },
        objectFit: 'none',
      };
    }
    case 'width':
    default:
      return {
        box: { width: availableWidth, height: availableWidth / aspectRatio },
        objectFit: 'contain',
      };
  }
}

function normalizeNaturalSize(
  size: { readonly width: number; readonly height: number } | undefined,
): { readonly width: number; readonly height: number } | undefined {
  if (size === undefined) return undefined;
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) return undefined;
  if (size.width <= 0 || size.height <= 0) return undefined;
  return size;
}
