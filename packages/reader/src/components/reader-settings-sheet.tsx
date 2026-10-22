import { useRef, type RefObject } from 'react';
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle } from '@app/design-system';
import { settingsDrawerTransition, useGsapContext, useReducedMotion } from '@app/motion';
import type { ReaderSettings } from '@app/shared';
import type { ReaderMetricsSnapshot } from '../reader-metrics.js';

export interface ReaderSettingsSheetProps {
  open: boolean;
  settings: ReaderSettings;
  onChangeSettings?: ((patch: Partial<ReaderSettings>) => void) | undefined;
  onClose: () => void;
  settingsButtonRef?: RefObject<HTMLButtonElement | null> | undefined;
  onResetSettings?: (() => void) | undefined;
  diagnostics?: ReaderMetricsSnapshot | undefined;
  onClearDiagnostics?: (() => void) | undefined;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function ReaderSettingsSheet({
  open,
  settings,
  onChangeSettings,
  onClose,
  settingsButtonRef,
  onResetSettings,
  diagnostics,
  onClearDiagnostics,
}: ReaderSettingsSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  useGsapContext(sheetRef, () => {
    if (!open || sheetRef.current === null) return;
    settingsDrawerTransition(sheetRef.current, 'open', { reducedMotion });
  }, [open, reducedMotion]);
  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  if (!open) return null;

  return (
    <Sheet open onOpenChange={handleOpenChange}>
      <SheetContent
        ref={sheetRef}
        side="right"
        aria-label="Reader settings"
        surface="glass"
        className="overflow-y-auto"
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
          {onResetSettings ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm">
                {settings.rememberPerTitleOverrides
                  ? 'Changes apply to this title, not your global defaults.'
                  : 'Changes also update your global reader defaults.'}
              </p>
              <Button variant="outline" onClick={onResetSettings}>
                Reset title settings
              </Button>
            </div>
          ) : null}
          {settings.diagnosticsEnabled && diagnostics ? (
            <DiagnosticsPanel diagnostics={diagnostics} onClear={onClearDiagnostics} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DiagnosticsPanel({
  diagnostics,
  onClear,
}: {
  diagnostics: ReaderMetricsSnapshot;
  onClear?: (() => void) | undefined;
}) {
  const rows: readonly [string, string][] = [
    ['Pages loaded', String(diagnostics.pageLoads)],
    ['Page failures', String(diagnostics.pageFailures)],
    ['Cache hits', String(diagnostics.cacheHits)],
    ['Cache misses', String(diagnostics.cacheMisses)],
    ['Last page load', `${diagnostics.lastLoadMs} ms`],
    ['Slowest page load', `${diagnostics.maxLoadMs} ms`],
    ['Prefetch runs', String(diagnostics.prefetchRuns)],
    ['Prefetched pages', String(diagnostics.prefetchPages)],
    ['Prefetch failures', String(diagnostics.prefetchFailures)],
    ['Prefetched bytes', formatBytes(diagnostics.prefetchedBytes)],
    ['Last prefetch', `${diagnostics.lastPrefetchMs} ms`],
  ];

  return (
    <section aria-label="Reader diagnostics" data-testid="reader-diagnostics" className="space-y-3">
      <div>
        <p className="text-sm font-medium">Reader diagnostics</p>
        <p className="text-sm text-muted-foreground">
          Page, cache, and prefetch timings for this reading session.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {diagnostics.events.length > 0 ? (
        <ol className="max-h-40 space-y-1 overflow-y-auto text-xs" aria-label="Recent events">
          {diagnostics.events.slice(0, 6).map((event) => (
            <li key={event.id} className="flex justify-between gap-2">
              <span>
                {event.kind === 'page'
                  ? `Page ${event.pageIndex !== undefined ? event.pageIndex + 1 : '?'}`
                  : `Prefetch ${event.pages ?? 0}`}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {event.status} · {event.durationMs} ms
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {onClear ? (
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear diagnostics
        </Button>
      ) : null}
    </section>
  );
}
