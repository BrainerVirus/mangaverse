import { READER_DISPLAY_DOWNSCALE_AUTO_EDGE_PX, type DisplayDownscale } from '@app/shared';

/**
 * The long-edge cap, in pixels, reader page images are shown at for the
 * `displayDownscale` setting; `undefined` shows the stored page as is.
 */
export function resolveDisplayMaxEdge(setting: DisplayDownscale | undefined): number | undefined {
  return setting === 'off' ? undefined : READER_DISPLAY_DOWNSCALE_AUTO_EDGE_PX;
}
