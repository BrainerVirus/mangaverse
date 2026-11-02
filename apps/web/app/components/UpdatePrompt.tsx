import { useSyncExternalStore } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/design-system';
import {
  dismissUpdatePrompt,
  getServerUpdatePromptSnapshot,
  getUpdatePromptSnapshot,
  installUpdatePrompt,
  subscribeUpdatePrompt,
} from '../lib/update-prompt-store.js';

/**
 * The renderer side of the update flow (#215, spec 04 X8): main never installs on its own, it
 * asks here. Main holds the event back while a chapter is open, so this prompt cannot cover the
 * reader; "Later" tells main to stop offering this version for the session.
 */
export function UpdatePrompt() {
  const update = useSyncExternalStore(
    subscribeUpdatePrompt,
    getUpdatePromptSnapshot,
    getServerUpdatePromptSnapshot,
  );

  if (update === null) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) dismissUpdatePrompt();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>MangaVerse {update.version} is ready</DialogTitle>
          <DialogDescription>
            Restart now to install it. Your reading progress is already saved. Later leaves this
            version alone until the next time you open the app.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={dismissUpdatePrompt}>
            Later
          </Button>
          <Button type="button" onClick={installUpdatePrompt}>
            Restart and install
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
