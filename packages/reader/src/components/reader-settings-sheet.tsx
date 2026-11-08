import { useId, useRef, type RefObject } from 'react';
import {
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Slider,
  useStateReducer,
} from '@app/design-system';
import {
  settingsDrawerTransition,
  useGsapContext,
  useReducedMotion,
} from '@app/design-system/motion';
import { READER_STRIP_GAP_MAX, type ReaderSettings } from '@app/shared';
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

const SPREAD_OFFSET_CHOICES = [
  ['0', 'Cover alone'],
  ['1', 'Offset by one'],
] as const;

const WIDE_PAGE_CHOICES = [
  ['isolate', 'Isolate'],
  ['split', 'Split'],
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
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
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

/** A labelled slider with its current value beside the label. */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="text-sm tabular-nums text-muted-foreground">{format(value)}</span>
      </div>
      <Slider
        id={id}
        value={value}
        min={min}
        max={max}
        step={step}
        aria-valuetext={format(value)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

/** The reader background, picked with the platform's colour input. */
function ColorRow({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        type="color"
        value={value}
        className="h-10 w-20 cursor-pointer p-1"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
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
    <div className="mt-6 flex flex-col gap-6">
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
      <SliderRow
        label="Strip gap"
        value={settings.verticalGapPx}
        min={0}
        max={READER_STRIP_GAP_MAX}
        step={1}
        format={(value) => `${value}px`}
        onChange={(verticalGapPx) => change({ verticalGapPx })}
      />
      <ColorRow
        label="Background"
        value={settings.backgroundColor}
        onChange={(backgroundColor) => change({ backgroundColor })}
      />
      <ChoiceGroup
        label="Tap zones"
        choices={TAP_ZONE_CHOICES}
        value={settings.tapZoneLayout}
        onChoose={(tapZoneLayout) => change({ tapZoneLayout })}
      />
      <ChoiceGroup
        label="Spread offset"
        choices={SPREAD_OFFSET_CHOICES}
        value={settings.spreadOffset === 1 ? '1' : '0'}
        onChoose={(offset) => change({ spreadOffset: offset === '1' ? 1 : 0 })}
      />
      <ChoiceGroup
        label="Wide pages"
        choices={WIDE_PAGE_CHOICES}
        value={settings.widePageMode}
        onChoose={(widePageMode) => change({ widePageMode })}
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
    <section
      aria-label="Reader diagnostics"
      data-testid="reader-diagnostics"
      className="flex flex-col gap-3"
    >
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
        <ol
          className="scroll-fade-y max-h-40 flex flex-col gap-1 overflow-y-auto text-xs"
          aria-label="Recent events"
        >
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
        <Button variant="outline" size="sm" className="self-start" onClick={onClear}>
          Clear diagnostics
        </Button>
      ) : null}
    </section>
  );
}
