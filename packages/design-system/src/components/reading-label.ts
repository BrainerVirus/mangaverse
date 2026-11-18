/** "Series · Chapter", or whichever of the two is known. */
export function readingLabel(
  seriesTitle: string | undefined,
  chapterTitle: string | undefined,
): string | undefined {
  const parts = [seriesTitle, chapterTitle].filter((part) => part !== undefined && part !== '');
  return parts.length === 0 ? undefined : parts.join(' · ');
}
