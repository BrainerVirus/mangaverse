/**
 * Electron shows its default File/Edit/View/Window/Help bar inside the window on Windows and
 * Linux. The app has no menu of its own to put there, so those platforms drop it. macOS keeps the
 * application menu: it lives in the system menu bar, and Cmd+C, Cmd+V and Cmd+Q are menu items.
 */
export function hidesApplicationMenu(platform: NodeJS.Platform): boolean {
  return platform !== 'darwin';
}
