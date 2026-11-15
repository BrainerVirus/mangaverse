/* oxlint-disable shadcn/no-inline-styles -- the stage colour is the reader's own setting, a runtime value that cannot be a static class. */
import type { CSSProperties } from 'react';
import { Button } from '@app/design-system';
import { resolvePagedFitInput } from '../page-fit.js';
import { pendingVisiblePages } from '../pending-pages.js';
import type { ReaderPageData } from '../reader-page-data.js';
import type { ReaderSessionInput, ReaderState } from '../types.js';
import { ReaderPagedLayer } from './ReaderPagedLayer.js';
import { ReaderScrollLayer } from './ReaderScrollLayer.js';

const PENDING_STAGE_TEST_IDS = {
  loading: 'reader-loading',
  hydrating: 'reader-hydrating',
} as const;

const PENDING_STAGE_MESSAGES = {
  loading: 'Loading chapter…',
  hydrating: 'Loading chapter pages…',
} as const;

/** The chapter's settings and session, known while its pages are still on their way. */
export interface ReaderPendingSession {
  readonly data: ReaderPageData;
  readonly readerState: ReaderState;
  readonly sessionInput: ReaderSessionInput;
}

const noop = () => {};

/**
 * The reader stage before the pages arrive. It is the surface the pages will
 * land on: the same box (it reports the viewport the session sizes from), the
 * same stage colour, and the same paged layer or strip, holding placeholder
 * pages sized by the same fit and layout math. Without the chapter's settings
 * (the local read has not returned) the stage stays empty rather than guess a
 * shape that would then change.
 */
export function ReaderPendingStage({
  kind,
  session,
  containerRef,
  reducedMotion,
  onClose,
}: {
  readonly kind: keyof typeof PENDING_STAGE_TEST_IDS;
  readonly session: ReaderPendingSession | null;
  readonly containerRef: (node: HTMLDivElement | null) => void;
  readonly reducedMotion: boolean;
  readonly onClose: (() => void) | undefined;
}) {
  const title = session?.data.chapter.title ?? '';
  return (
    <div
      ref={containerRef}
      className={
        session === null
          ? 'relative h-full w-full overflow-hidden bg-black'
          : 'reader-stage-background relative h-full w-full overflow-hidden'
      }
      style={
        session === null
          ? undefined
          : ({ '--reader-stage-color': session.data.settings.backgroundColor } as CSSProperties)
      }
      data-testid={PENDING_STAGE_TEST_IDS[kind]}
      aria-busy="true"
    >
      {session === null ? null : <PendingPages session={session} reducedMotion={reducedMotion} />}
      <ReaderStageHeader title={title} onClose={onClose} absolute />
      <output className="sr-only">{PENDING_STAGE_MESSAGES[kind]}</output>
    </div>
  );
}

/**
 * The stage's top row before the pages arrive: Close, then the chapter title,
 * which truncates instead of running under the button at any width. It lives
 * inside the reader's surface, which already starts below the desktop title
 * bar, so neither sits under the strip.
 */
export function ReaderStageHeader({
  title,
  onClose,
  absolute = false,
}: {
  readonly title: string;
  readonly onClose: (() => void) | undefined;
  /** Float over the stage instead of taking a row of its own. */
  readonly absolute?: boolean;
}) {
  if (title === '' && onClose === undefined) return null;
  return (
    <div
      data-testid="reader-stage-header"
      className={
        absolute
          ? 'safe-area-x safe-area-top absolute inset-x-0 top-0 z-10 flex items-center gap-3 pb-3'
          : 'safe-area-x safe-area-top flex items-center gap-3 pb-3'
      }
    >
      {onClose === undefined ? null : (
        <Button size="sm" variant="secondary" className="shrink-0" onClick={onClose}>
          Close reader
        </Button>
      )}
      {title === '' ? null : (
        <span className="min-w-0 truncate text-sm font-medium text-white">{title}</span>
      )}
    </div>
  );
}

/** The first page slot(s) the loaded chapter will show, through the loaded layers. */
function PendingPages({
  session: { data, readerState, sessionInput },
  reducedMotion,
}: {
  readonly session: ReaderPendingSession;
  readonly reducedMotion: boolean;
}) {
  const pages = pendingVisiblePages(sessionInput);
  if (readerState.mode === 'scroll') {
    return (
      <ReaderScrollLayer
        data={{ ...data, chapter: { ...data.chapter, pages, pageCount: pages.length } }}
        readerState={readerState}
        cacheContext={null}
        reducedMotion={reducedMotion}
        onActivePageChange={noop}
        onHandle={noop}
        onBack={undefined}
        onChapterEnd={undefined}
        onPageMetric={noop}
      />
    );
  }
  return (
    <ReaderPagedLayer
      readerState={readerState}
      visiblePages={pages}
      data={data}
      fitInput={resolvePagedFitInput({
        viewport: sessionInput.viewport,
        fitMode: readerState.settings.fitMode,
        pageCount: pages.length,
      })}
      cacheContext={null}
      imageSmoothing={data.engineSettings.imageSmoothing !== false}
      reducedMotion={reducedMotion}
      setPagedLayer={noop}
      setPageTransitionLayer={noop}
      onPointerDown={noop}
      onPointerMove={noop}
      onPointerUp={noop}
      onSkip={noop}
      onBack={undefined}
      onPageMetric={noop}
    />
  );
}
