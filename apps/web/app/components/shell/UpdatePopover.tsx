import { Clock, Download, RotateCw, ChevronRight } from 'lucide-react';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
  Progress,
  Separator,
  UpdatePill,
} from '@app/design-system';
import type { PlatformUpdateState } from '@app/platform';

import {
  titleBarUpdate,
  updatePopoverCopy,
  type TitleBarUpdate,
} from '../../features/updates/describe-update.js';

export interface UpdatePopoverProps {
  readonly update: PlatformUpdateState | null;
  readonly open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Later": main stops offering this version for the session; the pill stays. */
  onLater: () => void;
  onInstall: () => void;
  onOpenSettings: () => void;
}

/** The pill's glyph: the spinner only turns without a reduced-motion preference. */
function updateIcon(action: TitleBarUpdate) {
  switch (action.kind) {
    case 'downloading':
      return <Download />;
    case 'ready':
      return <RotateCw />;
    case 'queued':
      return <Clock />;
    case 'restarting':
      return <RotateCw className="animate-spin motion-reduce:animate-none" />;
  }
}

/**
 * The title bar's Update pill and the small panel it opens: live download progress, then
 * "Restart and install". It is not a modal: the page stays usable, Escape, an outside click or the
 * pill closes it. An offer from main opens it without taking focus (`initialFocus` only moves
 * focus for an interaction), so a reader mid-sentence loses nothing.
 *
 * The phase title sits in a status region, so it is announced once per phase. The percent and the
 * bytes stay out of it (the bar is a named `progressbar`, which Base UI does not announce), so a
 * download does not chatter.
 */
export function UpdatePopover({
  update,
  open,
  onOpenChange,
  onLater,
  onInstall,
  onOpenSettings,
}: UpdatePopoverProps) {
  const action = titleBarUpdate(update);
  const copy = updatePopoverCopy(update);
  if (action === null || copy === null) return null;
  return (
    <div className="app-region-no-drag flex">
      <Popover open={open} onOpenChange={(next) => onOpenChange(next)}>
        <PopoverTrigger
          render={
            <UpdatePill
              tone={action.kind === 'ready' ? 'attention' : 'neutral'}
              icon={updateIcon(action)}
              label={action.label}
              progress={action.percent ?? undefined}
              aria-label={action.name}
            />
          }
        />
        <PopoverContent align="end" initialFocus={(interaction) => interaction !== ''}>
          <div className="flex flex-col gap-1.5">
            {/* An `output` is the status region: the title is announced once per phase. */}
            <PopoverTitle render={<output className="block" />}>{copy.title}</PopoverTitle>
            <PopoverDescription>{copy.detail}</PopoverDescription>
          </div>
          {copy.progress === null ? null : (
            <div className="flex flex-col gap-1.5">
              <Progress aria-label="Download progress" value={copy.progress.percent} />
              <p className="type-meta tabular-nums text-glass-muted-foreground">
                {copy.progress.text}
              </p>
            </div>
          )}
          {copy.kind === 'ready' ? (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onLater}>
                Later
              </Button>
              <Button type="button" size="sm" onClick={onInstall}>
                Restart and install
              </Button>
            </div>
          ) : null}
          <Separator />
          <div className="flex">
            {/* -ml-3 cancels the button's own padding, so the text lines up with the copy above. */}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="-ml-3"
              onClick={onOpenSettings}
            >
              Update settings
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
