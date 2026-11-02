import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@app/design-system';

export interface MangaCustomCoverDialogProps {
  readonly open: boolean;
  readonly initialUrl?: string;
  readonly hasCustomCover: boolean;
  readonly isSaving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (url: string) => Promise<void> | void;
  onReset: () => Promise<void> | void;
}

function validateCoverUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Enter an image URL.';
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return 'Cover image URL must start with http:// or https://.';
    }
    return undefined;
  } catch {
    return 'Enter a valid cover image URL.';
  }
}

export function MangaCustomCoverDialog({
  open,
  initialUrl,
  hasCustomCover,
  isSaving = false,
  onOpenChange,
  onSave,
  onReset,
}: MangaCustomCoverDialogProps) {
  const [value, setValue] = useState(initialUrl ?? '');
  const [error, setError] = useState<string | undefined>();

  if (!open) return null;

  function run(action: () => Promise<void> | void): void {
    setError(undefined);
    void Promise.resolve(action()).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Could not save the cover.');
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Custom cover</DialogTitle>
          <DialogDescription>
            Paste an image URL to use your own cover. The override stays on this device.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-2">
          <Label htmlFor="custom-cover-url">Cover image URL</Label>
          <Input
            id="custom-cover-url"
            type="url"
            inputMode="url"
            placeholder="https://example.com/cover.jpg"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(undefined);
            }}
          />
          {error !== undefined ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="mt-6 gap-2">
          {hasCustomCover ? (
            <Button type="button" variant="ghost" disabled={isSaving} onClick={() => run(onReset)}>
              Reset to provider cover
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isSaving}
            onClick={() => {
              const validationError = validateCoverUrl(value);
              if (validationError !== undefined) {
                setError(validationError);
                return;
              }
              run(() => onSave(value.trim()));
            }}
          >
            Save cover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
