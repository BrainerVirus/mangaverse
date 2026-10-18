import type { FitMode } from '@app/shared';

export interface PageFitInput {
  readonly fitMode: FitMode;
  /** Area the paged view may use, in CSS pixels (viewport minus chrome insets). */
  readonly availableWidth: number;
  readonly availableHeight: number;
  /** Pages rendered side by side (a spread); each gets a share of the width. */
  readonly pageCount: number;
  /** Intrinsic page size (CSS pixels) when the source reports it. */
  readonly naturalSize?: { readonly width: number; readonly height: number } | undefined;
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
      // Never upscale: the natural size wins unless it overflows the area.
      const naturalWidth = natural?.width ?? availableWidth;
      const naturalHeight = natural?.height ?? naturalWidth / aspectRatio;
      const scale = Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight);
      return {
        box: { width: naturalWidth * scale, height: naturalHeight * scale },
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
