import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/design-system';

export interface ConfirmDeleteThemeDialogProps {
  readonly open: boolean;
  readonly themeName: string;
  readonly isDeleting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/** Destructive actions need a labelled confirmation before the theme row is removed. */
export function ConfirmDeleteThemeDialog({
  open,
  themeName,
  isDeleting = false,
  onOpenChange,
  onConfirm,
}: ConfirmDeleteThemeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{themeName}”?</DialogTitle>
          <DialogDescription>
            The custom theme is removed from this device. The selection falls back to the default
            theme.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep theme
          </Button>
          <Button variant="destructive" disabled={isDeleting} onClick={onConfirm}>
            {isDeleting ? 'Deleting…' : 'Delete theme'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
