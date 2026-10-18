function formatNumberList(values: readonly number[]): string {
  if (values.length === 1) return String(values[0]);
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

/**
 * Names the pages a reader cannot show offline, or null when the chapter is
 * fully cached. A chapter with a few pages missing must say so: rendering the
 * cached ones silently implies the whole chapter is available offline.
 *
 * `pageIndexes` are the chapter's page indexes (cache keys); the message counts
 * them the way the chrome does, from 1.
 */
export function formatUnavailableOfflinePages(
  pageIndexes: readonly number[],
  cachedPageIndexes: readonly number[],
): string | null {
  const cached = new Set(cachedPageIndexes);
  const missing = pageIndexes
    .filter((index) => !cached.has(index))
    .map((index) => index + 1)
    .sort((left, right) => left - right);

  if (missing.length === 0) return null;

  const plural = missing.length === 1;
  return `Offline: ${plural ? 'page' : 'pages'} ${formatNumberList(missing)} ${
    plural ? 'is' : 'are'
  } not saved locally.`;
}
