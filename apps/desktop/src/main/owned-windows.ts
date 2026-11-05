import type { WebFrameMain } from 'electron';

/** The part of a BrowserWindow the registry reads, so a test can pass a fake. */
export interface OwnableWindow {
  readonly webContents: { readonly mainFrame: WebFrameMain };
  once(event: 'closed', listener: () => void): unknown;
}

export interface OwnedWindows {
  /** Registers a window the caller just constructed; it leaves the registry when it closes. */
  own(window: OwnableWindow): void;
  /** The current main frame of every owned window; a navigation can swap the frame object. */
  mainFrames(): readonly WebFrameMain[];
}

/**
 * The windows this process constructed itself. Nothing registers a window except an explicit
 * `own` at the point main builds it, so a window Chromium opens (a popup, `noopener` or not)
 * is never owned and never reaches the data host.
 */
export function createOwnedWindows(): OwnedWindows {
  const owned = new Set<OwnableWindow>();
  return {
    own(window) {
      owned.add(window);
      window.once('closed', () => owned.delete(window));
    },
    mainFrames: () => [...owned].map((window) => window.webContents.mainFrame),
  };
}
