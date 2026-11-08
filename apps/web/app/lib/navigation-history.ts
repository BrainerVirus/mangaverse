type EntryMarker = 'reader' | 'discover-feed' | 'extensions';

export const readerSessionState = { navigationOpener: 'reader' as const };

/** A marker is written only when the immediately preceding entry is known. */
export function goBackIfMarked(
  history: { location: { state: object }; canGoBack: () => boolean; back: () => void },
  marker: EntryMarker,
): boolean {
  const state = history.location.state as { navigationOpener?: unknown };
  if (!history.canGoBack() || state.navigationOpener !== marker) return false;
  history.back();
  return true;
}
