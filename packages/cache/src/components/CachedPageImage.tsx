import { Button, cn } from '@app/design-system';
import type { ChapterId, MangaId, ProviderId } from '@app/shared';

import { useCoverCacheContext } from './CoverCacheProvider.js';
import { usePageObjectUrl } from './use-page-object-url.js';

export interface CachedPageImageMetric {
  readonly status: 'loaded' | 'failed';
  /** From the cache/network lookup to the decoded image (or its failure). */
  readonly durationMs: number;
  readonly fromCache: boolean;
  readonly byteSize: number;
}

export interface CachedPageImageProps {
  readonly providerId: ProviderId | string;
  readonly mangaId: MangaId | string;
  readonly chapterId: ChapterId | string;
  readonly pageIndex: number;
  readonly remoteUrl: string;
  readonly alt?: string;
  readonly className?: string;
  readonly retention?: 'read' | 'normal';
  readonly imageRendering?: 'auto' | 'pixelated';
  readonly onSkip?: (() => void) | undefined;
  readonly onBack?: (() => void) | undefined;
  readonly onLoad?: ((size: { width: number; height: number }) => void) | undefined;
  /** Low-frequency load telemetry for the reader diagnostics panel. */
  readonly onMetric?: ((metric: CachedPageImageMetric) => void) | undefined;
}

export function CachedPageImage({
  providerId,
  mangaId,
  chapterId,
  pageIndex,
  remoteUrl,
  alt = '',
  className,
  retention = 'read',
  imageRendering,
  onSkip,
  onBack,
  onLoad,
  onMetric,
}: CachedPageImageProps) {
  const context = useCoverCacheContext();
  const { src, failed, retry, reportLoaded, reportFailed } = usePageObjectUrl({
    context,
    providerId,
    mangaId,
    chapterId,
    pageIndex,
    remoteUrl,
    retention,
    ...(onMetric !== undefined ? { onMetric } : {}),
  });

  if (failed) {
    return (
      <FailedPage
        pageIndex={pageIndex}
        className={className}
        retry={retry}
        onSkip={onSkip}
        onBack={onBack}
      />
    );
  }

  if (context === null || src === undefined) {
    return (
      <div
        className={cn('animate-pulse bg-muted/80', context === null && 'animate-none', className)}
        aria-hidden={alt === ''}
        role={alt === '' ? undefined : 'img'}
        aria-label={alt === '' ? undefined : alt}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      // oxlint-disable-next-line shadcn/no-unknown-classes -- image-pixelated is declared with @utility in design-system globals.css; package lint misses @utility classes.
      className={cn(className, imageRendering === 'pixelated' && 'image-pixelated')}
      draggable={false}
      onError={reportFailed}
      onLoad={(event) => {
        onLoad?.({
          width: event.currentTarget.naturalWidth,
          height: event.currentTarget.naturalHeight,
        });
        reportLoaded();
      }}
    />
  );
}

function FailedPage({
  pageIndex,
  className,
  retry,
  onSkip,
  onBack,
}: {
  readonly pageIndex: number;
  readonly className: string | undefined;
  readonly retry: () => void;
  readonly onSkip: (() => void) | undefined;
  readonly onBack: (() => void) | undefined;
}) {
  return (
    <div
      className={cn(
        'flex min-h-40 flex-col items-center justify-center gap-3 bg-background p-4 text-foreground',
        className,
      )}
      role="alert"
      onPointerUp={(event) => event.stopPropagation()}
    >
      <p>Could not load page {pageIndex + 1}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={retry}>Retry</Button>
        {onSkip ? (
          <Button variant="outline" onClick={onSkip}>
            Skip page
          </Button>
        ) : null}
        {onBack ? (
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
        ) : null}
      </div>
    </div>
  );
}
