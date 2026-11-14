/**
 * The ambient band fades in once per app session. The shell remounts it after the reader, and a
 * second fade there would read as the whole window blinking.
 */
let entrancePlayed = false;

export function hasAmbientBackdropEntrancePlayed(): boolean {
  return entrancePlayed;
}

export function markAmbientBackdropEntrancePlayed(): void {
  entrancePlayed = true;
}

/** Tests only: forget that the entrance played, so each case starts from a fresh session. */
export function resetAmbientBackdropEntrance(): void {
  entrancePlayed = false;
}
