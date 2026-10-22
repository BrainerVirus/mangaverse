import type { ReactNode, RefObject } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  GlassSurface,
  ReaderChrome,
} from '@app/design-system';
import type { ReaderSettings } from '@app/shared';
import type { ReaderMetricsSnapshot } from '../reader-metrics.js';
import { ReaderSettingsSheet } from './reader-settings-sheet.js';

export interface ReaderOverlaysProps {
  readonly chapterTitle: string;
  readonly sourceName: string | undefined;
  readonly currentPage: number;
  readonly totalPages: number;
  readonly visible: boolean;
  readonly mode: 'single' | 'double' | 'scroll';
  readonly settingsOpen: boolean;
  readonly settings: ReaderSettings;
  readonly status: string | null;
  readonly chapterEndOpen: boolean;
  readonly chapterActionsOpen: boolean;
  readonly diagnostics: ReaderMetricsSnapshot | undefined;
  readonly settingsButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onClose: (() => void) | undefined;
  readonly onPageChange: (page: number) => void;
  readonly renderPagePreview: (page: number) => ReactNode;
  readonly onModeChange: (mode: 'single' | 'double' | 'scroll' | 'webtoon') => void;
  readonly onOpenSettings: () => void;
  readonly onOpenChapterActions: () => void;
  readonly onToggleFullscreen: () => void;
  readonly onCloseSettings: () => void;
  readonly onChangeSettings: ((patch: Partial<ReaderSettings>) => void) | undefined;
  readonly onResetSettings: (() => void) | undefined;
  readonly onClearDiagnostics: () => void;
  readonly onChapterEndOpenChange: (open: boolean) => void;
  readonly onChapterActionsOpenChange: (open: boolean) => void;
  readonly onNextChapter: (() => void) | undefined;
  readonly onPreviousChapter: (() => void) | undefined;
  readonly onMarkRead: ((completed: boolean) => void | Promise<void>) | undefined;
  readonly onMarkPreviousRead: (() => void | Promise<void>) | undefined;
}

/** Chrome, sheets and dialogs: everything that floats above the reading surface. */
export function ReaderOverlays({
  chapterTitle,
  sourceName,
  currentPage,
  totalPages,
  visible,
  mode,
  settingsOpen,
  settings,
  status,
  chapterEndOpen,
  chapterActionsOpen,
  diagnostics,
  settingsButtonRef,
  onClose,
  onPageChange,
  renderPagePreview,
  onModeChange,
  onOpenSettings,
  onOpenChapterActions,
  onToggleFullscreen,
  onCloseSettings,
  onChangeSettings,
  onResetSettings,
  onClearDiagnostics,
  onChapterEndOpenChange,
  onChapterActionsOpenChange,
  onNextChapter,
  onPreviousChapter,
  onMarkRead,
  onMarkPreviousRead,
}: ReaderOverlaysProps) {
  return (
    <>
      <ReaderChrome
        visible={visible}
        onClose={onClose}
        onChapterEnd={() => onChapterEndOpenChange(true)}
        chapterTitle={chapterTitle}
        {...(sourceName !== undefined ? { sourceName } : {})}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
        renderPagePreview={renderPagePreview}
        mode={mode}
        onModeChange={onModeChange}
        onOpenSettings={onOpenSettings}
        onOpenChapterActions={onOpenChapterActions}
        settingsButtonRef={settingsButtonRef}
        onToggleFullscreen={onToggleFullscreen}
      />

      <ReaderSettingsSheet
        open={settingsOpen}
        settings={settings}
        onChangeSettings={onChangeSettings}
        onClose={onCloseSettings}
        settingsButtonRef={settingsButtonRef}
        onResetSettings={onResetSettings}
        diagnostics={diagnostics}
        onClearDiagnostics={onClearDiagnostics}
      />
      <ReaderStatus message={status} />
      {chapterActionsOpen ? (
        <ChapterActions
          onOpenChange={onChapterActionsOpenChange}
          onMarkRead={onMarkRead}
          onMarkPreviousRead={onMarkPreviousRead}
        />
      ) : null}
      <HiddenReaderExit visible={visible} onClose={onClose} />
      {chapterEndOpen ? (
        <ChapterTransition
          onOpenChange={onChapterEndOpenChange}
          onNextChapter={onNextChapter}
          onPreviousChapter={onPreviousChapter}
          onClose={onClose}
        />
      ) : null}
    </>
  );
}

function HiddenReaderExit({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: (() => void) | undefined;
}) {
  if (visible || !onClose) return null;
  return (
    <Button size="sm" variant="secondary" className="fixed top-2 left-2 z-50" onClick={onClose}>
      Close reader
    </Button>
  );
}

/** Chapter action feedback; the reading surface stays where it is. */
function ReaderStatus({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <output
      data-testid="reader-status"
      className="dark pointer-events-none fixed inset-x-0 bottom-12 z-50 mx-auto block w-fit"
    >
      <div className="relative isolate overflow-hidden rounded-full">
        <GlassSurface
          level="stage"
          tone="reader"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        />
        <span className="relative block px-3 py-1 text-xs text-white">{message}</span>
      </div>
    </output>
  );
}

function ChapterActions({
  onOpenChange,
  onMarkRead,
  onMarkPreviousRead,
}: {
  onOpenChange: (open: boolean) => void;
  onMarkRead?: ((completed: boolean) => void | Promise<void>) | undefined;
  onMarkPreviousRead?: (() => void | Promise<void>) | undefined;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chapter actions</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {onMarkRead ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  void onMarkRead(true);
                  onOpenChange(false);
                }}
              >
                Mark chapter read
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void onMarkRead(false);
                  onOpenChange(false);
                }}
              >
                Mark chapter unread
              </Button>
            </>
          ) : null}
          {onMarkPreviousRead ? (
            <Button
              variant="outline"
              onClick={() => {
                void onMarkPreviousRead();
                onOpenChange(false);
              }}
            >
              Mark previous chapters read
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChapterTransition({
  onOpenChange,
  onNextChapter,
  onPreviousChapter,
  onClose,
}: {
  onOpenChange: (open: boolean) => void;
  onNextChapter: (() => void) | undefined;
  onPreviousChapter: (() => void) | undefined;
  onClose: (() => void) | undefined;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chapter complete</DialogTitle>
        </DialogHeader>
        <p>
          {onNextChapter
            ? 'Ready for the next chapter?'
            : 'You reached the last available chapter.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {onNextChapter ? <Button onClick={onNextChapter}>Read next chapter</Button> : null}
          {onPreviousChapter ? (
            <Button variant="outline" onClick={onPreviousChapter}>
              Previous chapter
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Back to chapter
          </Button>
          {onClose ? (
            <Button variant="outline" onClick={onClose}>
              Close reader
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
