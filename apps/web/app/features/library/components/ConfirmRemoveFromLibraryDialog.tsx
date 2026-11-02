import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/design-system';

export interface ConfirmRemoveFromLibraryDialogProps {
  readonly open: boolean;
  readonly mangaTitle: string;
  readonly isRemoving?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/** Removing a title deletes its entry, progress and favorite, so it asks first. */
export function ConfirmRemoveFromLibraryDialog({
  open,
  mangaTitle,
  isRemoving = false,
  onOpenChange,
  onConfirm,
}: ConfirmRemoveFromLibraryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove “{mangaTitle}” from your library?</DialogTitle>
          <DialogDescription>
            Its reading progress and favorite are removed from this device. You can add the title
            back at any time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep in library
          </Button>
          <Button variant="destructive" disabled={isRemoving} onClick={onConfirm}>
            {isRemoving ? 'Removing…' : 'Remove title'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
