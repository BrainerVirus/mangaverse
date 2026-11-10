import { useSyncExternalStore } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { UpdatePill } from '@app/design-system';
import type { PlatformUpdateState, PlatformWindowChrome } from '@app/platform';

import { titleBarUpdate } from '../../features/updates/describe-update.js';
import {
  getServerUpdateStateSnapshot,
  getUpdateStateSnapshot,
  installUpdateNow,
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
  /** A download's click: the settings page, where its progress lives. */
  onOpenUpdates: () => void;
  /** A ready release's click: restart and install (main queues it while a chapter is open). */
  onInstall: () => void;
}

/**
 * The desktop's app-drawn title bar. The strip drags the window; the native controls keep their
 * place (traffic lights on the left on macOS, the overlay on the right on Windows and Linux) and
 * the `title-bar` utility pads around them. It is not a landmark, and its only control is the
 * Update pill, which opts out of the drag region so it can be clicked: a quiet pill with a
 * progress ring while downloading (a click opens the settings page), the filled call to action
 * once a restart is waiting (a click restarts and installs; main queues it while a chapter is
 * open and the pill then reads "Restart queued"), and a pill that takes no click while it installs.
 */
export function TitleBarView({ chrome, update, onOpenUpdates, onInstall }: TitleBarViewProps) {
  if (chrome === null || chrome.fullScreen) return null;
  const action = titleBarUpdate(update);
  const clicks = { settings: onOpenUpdates, install: onInstall, none: undefined };
  return (
    <div data-title-bar data-platform={chrome.platform} className="title-bar">
      {action === null ? null : (
        <div className="app-region-no-drag flex">
          <UpdatePill
            kind={action.kind}
            label={action.label}
            progress={action.percent ?? undefined}
            aria-label={action.name}
            // A restart under way takes no click: `aria-disabled` keeps the pill focusable, so a
            // keyboard user who just pressed it keeps their place.
            aria-disabled={action.click === 'none' ? true : undefined}
            onClick={clicks[action.click]}
          />
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
      onInstall={installUpdateNow}
    />
  );
}
