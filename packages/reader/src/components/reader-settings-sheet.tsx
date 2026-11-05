import { useRef, type RefObject } from 'react';
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useStateReducer,
} from '@app/design-system';
import {
  settingsDrawerTransition,
  useGsapContext,
  useReducedMotion,
} from '@app/design-system/motion';
import type { ReaderSettings } from '@app/shared';
import type { ReaderMetricsSnapshot } from '../reader-metrics.js';
import type { ReaderSettingsScope } from '../types.js';

export type ReaderSettingsChangeHandler = (
  patch: Partial<ReaderSettings>,
  scope: ReaderSettingsScope,
) => void;

export interface ReaderSettingsSheetProps {
  open: boolean;
  settings: ReaderSettings;
  onChangeSettings?: ReaderSettingsChangeHandler | undefined;
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

const READING_MODE_CHOICES = [
  ['auto', 'Auto'],
  ['rtl', 'Right to left'],
  ['ltr', 'Left to right'],
  ['vertical', 'Vertical scroll'],
] as const;

const PAGE_LAYOUT_CHOICES = [
  ['auto', 'Auto'],
  ['single', 'Single page'],
  ['double', 'Double page'],
  ['smartSpread', 'Smart spread'],
] as const;

const FIT_MODE_CHOICES = [
  ['auto', 'Auto'],
  ['width', 'Fit width'],
  ['height', 'Fit height'],
  ['contain', 'Fit screen'],
  ['cover', 'Fill screen'],
  ['original', 'Original size'],
] as const;

const TAP_ZONE_CHOICES = [
  ['leftRight', 'Left / right'],
  ['lShaped', 'L-shaped'],
  ['grid', 'Grid'],
] as const;

const SCOPE_CHOICES = [
  ['title', 'This title'],
  ['global', 'All titles'],
] as const;

/** One labelled row of toggle buttons; the pressed one is the saved value. */
function ChoiceGroup<T extends string>({
  label,
  choices,
  value,
  onChoose,
}: {
  readonly label: string;
  readonly choices: readonly (readonly [T, string])[];
  readonly value: T;
  readonly onChoose: (value: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map(([choice, text]) => (
          <Button
            key={choice}
            size="sm"
            variant={value === choice ? 'default' : 'outline'}
            aria-pressed={value === choice}
            onClick={() => onChoose(choice)}
          >
            {text}
          </Button>
        ))}
      </div>
    </fieldset>
  );
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
        <QuickSettings
          settings={settings}
          onChangeSettings={onChangeSettings}
          onResetSettings={onResetSettings}
        />
        {settings.diagnosticsEnabled && diagnostics ? (
          <div className="mt-6">
            <DiagnosticsPanel diagnostics={diagnostics} onClear={onClearDiagnostics} />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/**
 * The quick panel. It mounts with the sheet, so its scope starts at "This
 * title" every time the panel opens and is never persisted.
 */
function QuickSettings({
  settings,
  onChangeSettings,
  onResetSettings,
}: {
  readonly settings: ReaderSettings;
  readonly onChangeSettings: ReaderSettingsChangeHandler | undefined;
  readonly onResetSettings: (() => void) | undefined;
}) {
  const [scope, setScope] = useStateReducer<ReaderSettingsScope, ReaderSettingsScope>(
    (_current, next) => next,
    'title',
  );
  const change = (patch: Partial<ReaderSettings>) => onChangeSettings?.(patch, scope);

  return (
    <div className="mt-6 space-y-6">
      <ChoiceGroup
        label="Reading mode"
        choices={READING_MODE_CHOICES}
        value={settings.readingMode}
        onChoose={(readingMode) => change({ readingMode })}
      />
      <ChoiceGroup
        label="Page layout"
        choices={PAGE_LAYOUT_CHOICES}
        value={settings.pageLayout}
        onChoose={(pageLayout) => change({ pageLayout })}
      />
      <ChoiceGroup
        label="Page fit"
        choices={FIT_MODE_CHOICES}
        value={settings.fitMode}
        onChoose={(fitMode) => change({ fitMode })}
      />
      <ChoiceGroup
        label="Tap zones"
        choices={TAP_ZONE_CHOICES}
        value={settings.tapZoneLayout}
        onChoose={(tapZoneLayout) => change({ tapZoneLayout })}
      />
      <div className="flex flex-col gap-2">
        <ChoiceGroup label="Applies to" choices={SCOPE_CHOICES} value={scope} onChoose={setScope} />
        <p className="text-sm text-muted-foreground">
          {scope === 'title'
            ? 'Changes apply to this title only.'
            : 'Changes update your defaults for every title.'}
        </p>
        {onResetSettings ? (
          <Button variant="outline" onClick={onResetSettings}>
            Reset title settings
          </Button>
        ) : null}
      </div>
    </div>
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
