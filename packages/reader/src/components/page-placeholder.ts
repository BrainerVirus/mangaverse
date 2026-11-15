/**
 * The look of a page that has no image yet: a quiet plate in the stage's own
 * ink with a hairline edge. Every reader placeholder shares it, so a chapter
 * whose pages are still on their way, a paged box and a strip row are one
 * surface. It pulses slowly only when motion is allowed.
 */
const READER_PAGE_PLACEHOLDER_CLASS = {
  still: 'rounded-control border border-stage-foreground/12 bg-stage-foreground/8',
  pulsing: 'rounded-control border border-stage-foreground/12 bg-stage-foreground/8 animate-pulse',
} as const;

export function readerPagePlaceholderClass(reducedMotion: boolean): string {
  return READER_PAGE_PLACEHOLDER_CLASS[reducedMotion ? 'still' : 'pulsing'];
}
