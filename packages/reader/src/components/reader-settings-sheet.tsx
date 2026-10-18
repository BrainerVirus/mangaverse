import type { RefObject } from 'react';
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle } from '@app/design-system';
import type { ReaderSettings } from '@app/shared';

export interface ReaderSettingsSheetProps {
  open: boolean;
  settings: ReaderSettings;
  onChangeSettings?: ((patch: Partial<ReaderSettings>) => void) | undefined;
  onClose: () => void;
  settingsButtonRef?: RefObject<HTMLButtonElement | null> | undefined;
}

export function ReaderSettingsSheet({
  open,
  settings,
  onChangeSettings,
  onClose,
  settingsButtonRef,
}: ReaderSettingsSheetProps) {
  if (!open) return null;

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        role="dialog"
        aria-label="Reader settings"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          settingsButtonRef?.current?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>Reader settings</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">Reading direction</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['ltr', 'Left to right'],
                  ['rtl', 'Right to left'],
                  ['vertical', 'Vertical scroll'],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={settings.readingMode === value ? 'default' : 'outline'}
                  aria-pressed={settings.readingMode === value}
                  onClick={() => onChangeSettings?.({ readingMode: value })}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Page layout</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['single', 'Single page'],
                  ['double', 'Double page'],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={settings.pageLayout === value ? 'default' : 'outline'}
                  aria-pressed={settings.pageLayout === value}
                  onClick={() =>
                    // Choosing a page layout leaves the vertical strip: the
                    // two would otherwise contradict each other.
                    onChangeSettings?.({
                      pageLayout: value,
                      ...(settings.readingMode === 'vertical'
                        ? { readingMode: 'ltr' as const }
                        : {}),
                    })
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Page fit</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['width', 'Fit width'],
                  ['height', 'Fit height'],
                  ['contain', 'Fit screen'],
                  ['cover', 'Fill screen'],
                  ['original', 'Original size'],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={settings.fitMode === value ? 'default' : 'outline'}
                  aria-pressed={settings.fitMode === value}
                  onClick={() => onChangeSettings?.({ fitMode: value })}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Tap zones</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['leftRight', 'Left / right'],
                  ['grid', 'Grid'],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={settings.tapZoneLayout === value ? 'default' : 'outline'}
                  aria-pressed={settings.tapZoneLayout === value}
                  onClick={() => onChangeSettings?.({ tapZoneLayout: value })}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
