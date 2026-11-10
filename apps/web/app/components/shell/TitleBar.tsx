import { useSyncExternalStore } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { PlatformUpdateState, PlatformWindowChrome } from '@app/platform';

import { dismissUpdatePrompt, installUpdatePrompt } from '../../lib/update-prompt-store.js';
import {
  getServerUpdatePopoverOpenSnapshot,
  getUpdatePopoverOpenSnapshot,
  setUpdatePopoverOpen,
  subscribeUpdatePopover,
} from '../../lib/update-popover-store.js';
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
import { UpdatePopover, type UpdatePopoverProps } from './UpdatePopover.js';

export interface TitleBarViewProps extends Omit<UpdatePopoverProps, 'update'> {
  /** `null` before main answers and in the web build: no strip at all. */
  readonly chrome: PlatformWindowChrome | null;
  readonly update: PlatformUpdateState | null;
}

/**
 * The desktop's app-drawn title bar. The strip drags the window; the native controls keep their
 * place (traffic lights on the left on macOS, the overlay on the right on Windows and Linux) and
 * the `title-bar` utility pads around them. It is not a landmark, and its only control is the
 * Update pill, which opts out of the drag region so it can be clicked: a quiet pill with a
 * progress ring while downloading, the filled call to action once a restart is waiting. The pill
 * opens the update popover.
 */
export function TitleBarView({ chrome, update, ...popover }: TitleBarViewProps) {
  if (chrome === null || chrome.fullScreen) return null;
  return (
    <div data-title-bar data-platform={chrome.platform} className="title-bar">
      <UpdatePopover update={update} {...popover} />
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
  const open = useSyncExternalStore(
    subscribeUpdatePopover,
    getUpdatePopoverOpenSnapshot,
    getServerUpdatePopoverOpenSnapshot,
  );
  return (
    <TitleBarView
      chrome={chrome}
      update={update}
      open={open}
      onOpenChange={setUpdatePopoverOpen}
      onLater={() => {
        dismissUpdatePrompt();
        setUpdatePopoverOpen(false);
      }}
      onInstall={installUpdatePrompt}
      onOpenSettings={() => {
        setUpdatePopoverOpen(false);
        void navigate({ to: '/settings/updates' });
      }}
    />
  );
}
