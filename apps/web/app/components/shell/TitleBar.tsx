import { useSyncExternalStore } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@app/design-system';
import type { PlatformUpdateState, PlatformWindowChrome } from '@app/platform';

import { titleBarUpdate } from '../../features/updates/describe-update.js';
import {
  getServerUpdateStateSnapshot,
  getUpdateStateSnapshot,
  subscribeUpdateState,
} from '../../lib/update-state-store.js';
import {
  getServerWindowChromeSnapshot,
  getWindowChromeSnapshot,
  subscribeWindowChrome,
} from '../../lib/window-chrome-store.js';

export interface TitleBarViewProps {
  /** `null` before main answers and in the web build: no strip at all. */
  readonly chrome: PlatformWindowChrome | null;
  readonly update: PlatformUpdateState | null;
  onOpenUpdates: () => void;
}

/**
 * The desktop's app-drawn title bar. The strip drags the window; the native controls keep their
 * place (traffic lights on the left on macOS, the overlay on the right on Windows and Linux) and
 * the `title-bar` utility pads around them. It is not a landmark, and its only control is the
 * Update button, which opts out of the drag region so it can be clicked.
 */
export function TitleBarView({ chrome, update, onOpenUpdates }: TitleBarViewProps) {
  if (chrome === null || chrome.fullScreen) return null;
  const action = titleBarUpdate(update);
  return (
    <div data-title-bar data-platform={chrome.platform} className="title-bar">
      {action === null ? null : (
        <div className="app-region-no-drag flex">
          <Button variant="ghost" size="sm" aria-label={action.name} onClick={onOpenUpdates}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}

export function TitleBar() {
  const navigate = useNavigate();
  const chrome = useSyncExternalStore(
    subscribeWindowChrome,
    getWindowChromeSnapshot,
    getServerWindowChromeSnapshot,
  );
  const update = useSyncExternalStore(
    subscribeUpdateState,
    getUpdateStateSnapshot,
    getServerUpdateStateSnapshot,
  );
  return (
    <TitleBarView
      chrome={chrome}
      update={update}
      onOpenUpdates={() => void navigate({ to: '/settings/updates' })}
    />
  );
}
