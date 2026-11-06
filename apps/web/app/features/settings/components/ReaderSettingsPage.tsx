import {
  Button,
  ErrorState,
  Input,
  Label,
  LoadingState,
  PageContainer,
  PageHeader,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsSection,
  Slider,
  Switch,
} from '@app/design-system';
import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  KEYBOARD_SHORTCUT_ACTION_LABELS,
  KEYBOARD_SHORTCUT_ACTIONS,
  PREFETCH_BUDGET_DEFAULT_BYTES,
  READER_PRELOAD_MAX,
  READER_STRIP_GAP_MAX,
  READER_STRIP_WIDTH_AUTO_PERCENT,
  READER_STRIP_WIDTH_MIN_PERCENT,
  READER_TILING_THRESHOLDS,
  defaultKeyboardShortcuts,
  findKeyboardShortcutConflict,
  formatKeyboardShortcut,
  isReservedShortcutKey,
  normalizeKeyboardShortcut,
  type FitMode,
  type KeyboardShortcut,
  type KeyboardShortcutAction,
  type NavigationDirection,
  type PageLayoutMode,
  type PageTransitionMode,
  type ReaderChromeVisibility,
  type ReaderSettings,
  type ReadingMode,
  type SpreadOffset,
  type TapZoneLayout,
  type TilingThreshold,
  type WheelBehavior,
  type WidePageMode,
} from '@app/shared';

export interface ReaderSettingsPageProps {
  readonly settings: ReaderSettings | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  onChange: (patch: Partial<ReaderSettings>) => void;
  /** Pointer-up or blur: commit a coalesced edit without waiting for the quiet window. */
  onInteractionEnd?: () => void;
  /** Present when the page edits one title's overrides instead of the global defaults. */
  readonly titleScope?: {
    onReset: () => void;
    isResetting?: boolean;
  };
}

const READING_MODE_OPTIONS: readonly { value: ReadingMode; label: string }[] = [
  { value: 'auto', label: 'Auto (detect per title)' },
  { value: 'ltr', label: 'Left to right' },
  { value: 'rtl', label: 'Right to left (manga)' },
  { value: 'vertical', label: 'Vertical (webtoon)' },
];

const PAGE_LAYOUT_OPTIONS: readonly { value: PageLayoutMode; label: string }[] = [
  { value: 'auto', label: 'Auto (spreads in landscape)' },
  { value: 'single', label: 'Single page' },
  { value: 'double', label: 'Double page' },
  { value: 'smartSpread', label: 'Smart spread' },
];

const FIT_MODE_OPTIONS: readonly { value: FitMode; label: string }[] = [
  { value: 'auto', label: 'Auto (screen when paged, width in strips)' },
  { value: 'width', label: 'Fit width' },
  { value: 'height', label: 'Fit height' },
  { value: 'contain', label: 'Fit screen' },
  { value: 'cover', label: 'Fill screen' },
  { value: 'original', label: 'Original size' },
];

const TAP_ZONE_OPTIONS: readonly { value: TapZoneLayout; label: string }[] = [
  { value: 'leftRight', label: 'Left / right' },
  { value: 'lShaped', label: 'L-shaped' },
  { value: 'grid', label: 'Grid' },
];

const NAV_DIRECTION_OPTIONS: readonly { value: NavigationDirection; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'inverted', label: 'Inverted' },
];

const CHROME_VISIBILITY_OPTIONS: readonly { value: ReaderChromeVisibility; label: string }[] = [
  { value: 'auto', label: 'Auto hide' },
  { value: 'always', label: 'Always visible' },
  { value: 'hidden', label: 'Hidden' },
];

const PAGE_TRANSITION_OPTIONS: readonly { value: PageTransitionMode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
];

const WHEEL_BEHAVIOR_OPTIONS: readonly { value: WheelBehavior; label: string }[] = [
  { value: 'scroll', label: 'Scroll pages' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'none', label: 'Disabled' },
];

const SPREAD_OFFSET_OPTIONS: readonly { value: `${SpreadOffset}`; label: string }[] = [
  { value: '0', label: 'Cover alone' },
  { value: '1', label: 'Offset by one' },
];

const WIDE_PAGE_OPTIONS: readonly { value: WidePageMode; label: string }[] = [
  { value: 'isolate', label: 'Isolate (one page)' },
  { value: 'split', label: 'Split across the spread' },
];

const TILING_THRESHOLD_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  ...READER_TILING_THRESHOLDS.map((px) => ({ value: String(px), label: `${px}px` })),
];

const MIB = 1024 * 1024;

const PREFETCH_BUDGET_PRESETS: readonly { value: string; label: string }[] = [
  { value: '0', label: 'Unlimited' },
  { value: String(100 * MIB), label: '100 MB' },
  { value: String(PREFETCH_BUDGET_DEFAULT_BYTES), label: '250 MB (default)' },
  { value: String(500 * MIB), label: '500 MB' },
  { value: String(1024 * MIB), label: '1 GB' },
];

const PREFETCH_BUDGET_CUSTOM = 'custom';

/**
 * The budget presets, plus "Custom" while the stored value matches none of
 * them: a value saved by an older build is shown as is, never clamped.
 */
function prefetchBudgetChoice(bytes: number): {
  readonly value: string;
  readonly options: readonly { value: string; label: string }[];
} {
  const value = String(bytes);
  if (PREFETCH_BUDGET_PRESETS.some((preset) => preset.value === value)) {
    return { value, options: PREFETCH_BUDGET_PRESETS };
  }
  return {
    value: PREFETCH_BUDGET_CUSTOM,
    options: [...PREFETCH_BUDGET_PRESETS, { value: PREFETCH_BUDGET_CUSTOM, label: 'Custom' }],
  };
}

function formatStripWidth(percent: number): string {
  return percent >= READER_STRIP_WIDTH_AUTO_PERCENT ? '100% (auto)' : `${percent}%`;
}

function SettingToggleRow({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onClick={() => onCheckedChange(!checked)}
      />
    </div>
  );
}

function SettingSelectRow({
  id,
  label,
  description,
  value,
  disabled,
  options,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  value: string;
  disabled?: boolean;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      <Select
        value={value}
        onValueChange={onChange}
        {...(disabled !== undefined ? { disabled } : {})}
      >
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function SettingSliderRow({
  id,
  label,
  description,
  value,
  min,
  max,
  step,
  disabled,
  formatValue,
  onChange,
  onCommit,
}: {
  id: string;
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
  onCommit?: (() => void) | undefined;
}) {
  const display = formatValue ? formatValue(value) : String(value);

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-sm tabular-nums text-muted-foreground">{display}</span>
      </div>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      <Slider
        id={id}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-valuetext={display}
        onPointerUp={onCommit}
        onBlur={onCommit}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function modifierNames(event: {
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
}): NonNullable<KeyboardShortcut['modifiers']> {
  return [
    ...(event.ctrlKey ? (['Control'] as const) : []),
    ...(event.altKey ? (['Alt'] as const) : []),
    ...(event.shiftKey ? (['Shift'] as const) : []),
    ...(event.metaKey ? (['Meta'] as const) : []),
  ];
}

export function KeyboardShortcutsEditor({
  settings,
  onChange,
  onCommit,
}: {
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
  onCommit?: (() => void) | undefined;
}) {
  const [capturing, setCapturing] = useState<KeyboardShortcutAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An empty saved list means "use the defaults", including direction-aware
  // arrows; editing materializes them so the saved list is exactly what is shown.
  const bindings =
    settings.keyboardShortcuts.length > 0
      ? settings.keyboardShortcuts
      : defaultKeyboardShortcuts(settings.readingMode, settings.navigationDirection);

  const bindingFor = (action: KeyboardShortcutAction): KeyboardShortcut | undefined =>
    bindings.find((shortcut) => shortcut.action === action);

  const saveBindings = (next: readonly KeyboardShortcut[]) => {
    onChange({ keyboardShortcuts: next });
    onCommit?.();
  };

  const capture = (action: KeyboardShortcutAction, event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setCapturing(null);
      setError(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (isReservedShortcutKey(event.key)) {
      setError(`${event.key} is reserved by the reader.`);
      return;
    }
    const candidate = normalizeKeyboardShortcut({
      action,
      key: event.key,
      modifiers: modifierNames(event),
    });
    const conflict = findKeyboardShortcutConflict(bindings, candidate);
    if (conflict !== undefined) {
      setError(
        `${formatKeyboardShortcut(candidate)} is already used for ${KEYBOARD_SHORTCUT_ACTION_LABELS[conflict.action]}.`,
      );
      return;
    }
    const next = bindings.some((shortcut) => shortcut.action === action)
      ? bindings.map((shortcut) => (shortcut.action === action ? candidate : shortcut))
      : [...bindings, candidate];
    saveBindings(next);
    setCapturing(null);
    setError(null);
  };

  return (
    <div className="grid gap-3" data-testid="keyboard-shortcut-editor">
      <div className="grid gap-2">
        {KEYBOARD_SHORTCUT_ACTIONS.map((action) => {
          const binding = bindingFor(action);
          const isCapturing = capturing === action;
          return (
            <div key={action} className="flex items-center justify-between gap-4">
              <span className="text-sm">{KEYBOARD_SHORTCUT_ACTION_LABELS[action]}</span>
              <Button
                variant={isCapturing ? 'default' : 'outline'}
                size="sm"
                aria-label={`Change shortcut for ${KEYBOARD_SHORTCUT_ACTION_LABELS[action]}`}
                aria-pressed={isCapturing}
                onClick={() => {
                  setCapturing(isCapturing ? null : action);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (isCapturing) capture(action, event);
                }}
                data-testid={`shortcut-${action}`}
              >
                {isCapturing
                  ? 'Press keys…'
                  : binding
                    ? formatKeyboardShortcut(binding)
                    : 'Not set'}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">
        Press Change, then the key combination. Escape still closes the reader and Tab still moves
        focus.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => saveBindings([])}>
        Reset to defaults
      </Button>
    </div>
  );
}

export function KeyboardShortcutsSection({
  settings,
  onChange,
  onCommit,
}: {
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
  onCommit?: (() => void) | undefined;
}) {
  return (
    <SettingsSection
      title="Keyboard shortcuts"
      description="Rebind the keys that drive the reader while reading."
    >
      <KeyboardShortcutsEditor settings={settings} onChange={onChange} onCommit={onCommit} />
    </SettingsSection>
  );
}

export function GestureSettingsSection({
  settings,
  onChange,
  onCommit,
}: {
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
  onCommit?: (() => void) | undefined;
}) {
  return (
    <SettingsSection title="Gestures" description="Touch sensitivity and zoom levels.">
      <div className="grid gap-4">
        <SettingSliderRow
          id="gesture-sensitivity"
          label="Gesture sensitivity"
          description="Higher values accept a looser double tap and start panning sooner."
          value={settings.gestureSensitivity}
          min={0.5}
          max={2}
          step={0.1}
          formatValue={(value) => `${value.toFixed(1)}×`}
          onChange={(gestureSensitivity) => onChange({ gestureSensitivity })}
          onCommit={onCommit}
        />
        <SettingSliderRow
          id="pinch-sensitivity"
          label="Pinch zoom sensitivity"
          description="How strongly a pinch changes the zoom level."
          value={settings.pinchSensitivity}
          min={0.5}
          max={2}
          step={0.1}
          formatValue={(value) => `${value.toFixed(1)}×`}
          onChange={(pinchSensitivity) => onChange({ pinchSensitivity })}
          onCommit={onCommit}
        />
        <SettingSliderRow
          id="double-tap-zoom"
          label="Double-tap zoom"
          description="Zoom level a double tap opens to; a second double tap returns to fit."
          value={settings.doubleTapZoom}
          min={1}
          max={5}
          step={0.1}
          formatValue={(value) => `${Math.round(value * 100)}%`}
          onChange={(doubleTapZoom) => onChange({ doubleTapZoom })}
          onCommit={onCommit}
        />
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => {
            onChange({ gestureSensitivity: 1, pinchSensitivity: 1, doubleTapZoom: 1.5 });
            onCommit?.();
          }}
        >
          Reset gesture settings
        </Button>
      </div>
    </SettingsSection>
  );
}

export function DisplaySettingsSection({
  settings,
  update,
  commit,
  onInteractionEnd,
}: {
  readonly settings: ReaderSettings;
  readonly update: (patch: Partial<ReaderSettings>) => void;
  readonly commit: (patch: Partial<ReaderSettings>) => void;
  readonly onInteractionEnd: (() => void) | undefined;
}) {
  return (
    <SettingsSection title="Display" description="Reader chrome, transitions, and background.">
      <div className="grid gap-4">
        <SettingSelectRow
          id="chrome-visibility"
          label="Reader chrome"
          description="Controls visibility of the top and bottom toolbars."
          value={settings.chromeVisibility}
          options={CHROME_VISIBILITY_OPTIONS}
          onChange={(chromeVisibility) =>
            commit({ chromeVisibility: chromeVisibility as ReaderChromeVisibility })
          }
        />
        <SettingSelectRow
          id="page-transition"
          label="Page transition"
          value={settings.pageTransition}
          options={PAGE_TRANSITION_OPTIONS}
          onChange={(pageTransition) =>
            commit({ pageTransition: pageTransition as PageTransitionMode })
          }
        />
        <div className="grid gap-2">
          <Label htmlFor="background-color">Background color</Label>
          <Input
            id="background-color"
            type="color"
            value={settings.backgroundColor}
            className="h-10 w-20 cursor-pointer p-1"
            onBlur={onInteractionEnd}
            onChange={(event) => update({ backgroundColor: event.target.value })}
          />
        </div>
        <SettingSliderRow
          id="vertical-gap"
          label="Vertical gap"
          description="Space between strips in vertical reading mode (pixels)."
          value={settings.verticalGapPx}
          min={0}
          max={READER_STRIP_GAP_MAX}
          step={1}
          formatValue={(value) => `${value}px`}
          onChange={(verticalGapPx) => update({ verticalGapPx })}
          onCommit={onInteractionEnd}
        />
        <SettingSliderRow
          id="max-strip-width"
          label="Max strip width"
          description="Width of the vertical strip. 100% is Auto: full width on phones, about 70% on screens 1024px and wider."
          value={settings.maxStripWidthPercent}
          min={READER_STRIP_WIDTH_MIN_PERCENT}
          max={READER_STRIP_WIDTH_AUTO_PERCENT}
          step={5}
          formatValue={formatStripWidth}
          onChange={(maxStripWidthPercent) => update({ maxStripWidthPercent })}
          onCommit={onInteractionEnd}
        />
        <SettingToggleRow
          id="show-page-number"
          label="Page number"
          description="Show the current page beside the chapter title."
          checked={settings.showPageNumber}
          onCheckedChange={(showPageNumber) => commit({ showPageNumber })}
        />
        <SettingToggleRow
          id="show-chapter-transition"
          label="Chapter transition screen"
          description="At the end of a chapter, offer the next one. Off keeps you on the last page."
          checked={settings.showChapterTransition}
          onCheckedChange={(showChapterTransition) => commit({ showChapterTransition })}
        />
      </div>
    </SettingsSection>
  );
}

export function ReaderSettingsPage({
  settings,
  isLoading,
  isError,
  onChange,
  onInteractionEnd,
  titleScope,
}: ReaderSettingsPageProps) {
  if (isLoading) {
    return (
      <PageContainer variant="read">
        <section aria-label="Reader settings">
          <LoadingState type="list" count={3} />
        </section>
      </PageContainer>
    );
  }

  if (isError || settings === undefined) {
    return (
      <PageContainer variant="read">
        <section aria-label="Reader settings">
          <ErrorState
            title="Could not load reader settings"
            message="Local reader preferences failed to load. Try again in a moment."
          />
        </section>
      </PageContainer>
    );
  }

  const update = (patch: Partial<ReaderSettings>) => {
    // A patch, not a full object: the route merges it over the freshest cached
    // settings, so two quick edits can never write one over the other.
    onChange(patch);
  };
  const commit = (patch: Partial<ReaderSettings>) => {
    update(patch);
    onInteractionEnd?.();
  };

  return (
    <PageContainer variant="read">
      <section aria-label="Reader settings" className="flex flex-col gap-6">
        <PageHeader
          title="Reader settings"
          description={
            titleScope !== undefined
              ? 'Reading mode, layout, gestures, and display preferences for this title.'
              : 'Default reading mode, layout, gestures, and display preferences.'
          }
          actions={
            titleScope !== undefined ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={titleScope.isResetting === true}
                onClick={titleScope.onReset}
              >
                {titleScope.isResetting === true ? 'Resetting…' : 'Reset title settings'}
              </Button>
            ) : undefined
          }
        />

        <SettingsSection
          title="Reading mode"
          description="How pages are laid out and which direction you read."
        >
          <div className="grid gap-4">
            <SettingSelectRow
              id="reading-mode"
              label="Reading mode"
              value={settings.readingMode}
              options={READING_MODE_OPTIONS}
              onChange={(readingMode) => commit({ readingMode: readingMode as ReadingMode })}
            />
            <SettingSelectRow
              id="page-layout"
              label="Page layout"
              description="How many pages appear at once in paged modes."
              value={settings.pageLayout}
              options={PAGE_LAYOUT_OPTIONS}
              onChange={(pageLayout) => commit({ pageLayout: pageLayout as PageLayoutMode })}
            />
            <SettingSelectRow
              id="spread-offset"
              label="Spread offset"
              description="Which pages pair up in double layouts. Offset by one fixes spreads split by a credits page."
              value={String(settings.spreadOffset)}
              options={SPREAD_OFFSET_OPTIONS}
              onChange={(offset) => commit({ spreadOffset: offset === '1' ? 1 : 0 })}
            />
            <SettingSelectRow
              id="wide-page-mode"
              label="Wide pages"
              description="How double layouts show a landscape page. Isolate, the default, shows it alone; split fills the spread with its two halves."
              value={settings.widePageMode}
              options={WIDE_PAGE_OPTIONS}
              onChange={(widePageMode) => commit({ widePageMode: widePageMode as WidePageMode })}
            />
            <SettingSelectRow
              id="fit-mode"
              label="Page fit"
              value={settings.fitMode}
              options={FIT_MODE_OPTIONS}
              onChange={(fitMode) => commit({ fitMode: fitMode as FitMode })}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Navigation"
          description="Tap zones, scroll wheel, and navigation direction."
        >
          <div className="grid gap-4">
            <SettingSelectRow
              id="tap-zone-layout"
              label="Tap zones"
              description="Screen regions used for previous and next page taps."
              value={settings.tapZoneLayout}
              options={TAP_ZONE_OPTIONS}
              onChange={(tapZoneLayout) =>
                commit({ tapZoneLayout: tapZoneLayout as TapZoneLayout })
              }
            />
            <SettingSelectRow
              id="navigation-direction"
              label="Navigation direction"
              value={settings.navigationDirection}
              options={NAV_DIRECTION_OPTIONS}
              onChange={(navigationDirection) =>
                commit({ navigationDirection: navigationDirection as NavigationDirection })
              }
            />
            <SettingSelectRow
              id="wheel-behavior"
              label="Mouse wheel"
              value={settings.wheelBehavior}
              options={WHEEL_BEHAVIOR_OPTIONS}
              onChange={(wheelBehavior) =>
                commit({ wheelBehavior: wheelBehavior as WheelBehavior })
              }
            />
          </div>
        </SettingsSection>

        <KeyboardShortcutsSection
          settings={settings}
          onChange={update}
          onCommit={onInteractionEnd}
        />

        <GestureSettingsSection settings={settings} onChange={update} onCommit={onInteractionEnd} />

        <DisplaySettingsSection
          settings={settings}
          update={update}
          commit={commit}
          onInteractionEnd={onInteractionEnd}
        />

        <SettingsSection title="Behavior" description="Screen, fullscreen and image preferences.">
          <div className="grid gap-4">
            <SettingToggleRow
              id="keep-screen-on"
              label="Keep screen on"
              description="Prevent the display from sleeping while reading."
              checked={settings.keepScreenOn}
              onCheckedChange={(keepScreenOn) => commit({ keepScreenOn })}
            />
            <SettingToggleRow
              id="fullscreen-on-open"
              label="Fullscreen on open"
              description="Enter fullscreen when opening the reader."
              checked={settings.fullscreenOnOpen}
              onCheckedChange={(fullscreenOnOpen) => commit({ fullscreenOnOpen })}
            />
            <SettingToggleRow
              id="image-smoothing"
              label="Image smoothing"
              description="Apply browser filtering when scaling page images."
              checked={settings.imageSmoothing}
              onCheckedChange={(imageSmoothing) => commit({ imageSmoothing })}
            />
          </div>
        </SettingsSection>

        <SettingsSection title="Performance" description="Preloading and memory use while reading.">
          <div className="grid gap-4">
            <SettingSliderRow
              id="preload-ahead"
              label="Preload ahead"
              description="Number of upcoming pages to load in advance."
              value={settings.preloadAhead}
              min={0}
              max={READER_PRELOAD_MAX}
              step={1}
              onChange={(preloadAhead) => update({ preloadAhead })}
              onCommit={onInteractionEnd}
            />
            <SettingSliderRow
              id="preload-behind"
              label="Preload behind"
              description="Number of previous pages kept ready for turning back."
              value={settings.preloadBehind}
              min={0}
              max={READER_PRELOAD_MAX}
              step={1}
              onChange={(preloadBehind) => update({ preloadBehind })}
              onCommit={onInteractionEnd}
            />
            <SettingSelectRow
              id="prefetch-budget"
              label="Prefetch budget"
              description="Stop prefetching after this much newly downloaded data; cached pages are free."
              {...prefetchBudgetChoice(settings.prefetchBudgetBytes)}
              onChange={(choice) => {
                if (choice === PREFETCH_BUDGET_CUSTOM) return;
                commit({ prefetchBudgetBytes: Number(choice) });
              }}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Advanced"
          description="Less common rendering and diagnostic options."
          collapsed
        >
          <div className="grid gap-4">
            <SettingToggleRow
              id="low-memory-mode"
              label="Low-memory mode"
              description="Reduce preloading and image quality on constrained devices."
              checked={settings.lowMemoryMode}
              onCheckedChange={(lowMemoryMode) => commit({ lowMemoryMode })}
            />
            <SettingToggleRow
              id="data-saver"
              label="Data saver"
              description="Manual, not detected from your connection. Only the page being read loads: no preloading, prefetching or decoding ahead, so turning a page waits for it."
              checked={settings.dataSaver}
              onCheckedChange={(dataSaver) => commit({ dataSaver })}
            />
            <SettingSelectRow
              id="tiling-threshold"
              label="Tall-page tiling threshold"
              description="Pages in a vertical strip taller than this are split into tiles to stay inside browser image limits. Auto uses 8192px."
              value={String(settings.tilingThreshold)}
              options={TILING_THRESHOLD_OPTIONS}
              onChange={(tilingThreshold) =>
                commit({
                  tilingThreshold:
                    tilingThreshold === 'auto'
                      ? 'auto'
                      : (Number(tilingThreshold) as Exclude<TilingThreshold, 'auto'>),
                })
              }
            />
            <SettingSliderRow
              id="next-chapter-threshold"
              label="Next-chapter threshold"
              description="In a vertical strip, how far you scroll past the last page before the next chapter is offered, as a share of the screen height. 0% offers it as the last page ends. Needs the chapter transition screen on."
              value={settings.nextChapterThresholdPercent}
              min={0}
              max={100}
              step={5}
              formatValue={(percent) => `${percent}%`}
              onChange={(nextChapterThresholdPercent) => update({ nextChapterThresholdPercent })}
              onCommit={onInteractionEnd}
            />
            <SettingToggleRow
              id="long-strip-optimization"
              label="Long strip optimization"
              description="Optimize rendering for very long vertical chapters."
              checked={settings.longStripOptimization}
              onCheckedChange={(longStripOptimization) => commit({ longStripOptimization })}
            />
            <SettingToggleRow
              id="tap-zone-debug-overlay"
              label="Tap zone debug overlay"
              description="Show the active tap zones on top of the page."
              checked={settings.tapZoneDebugOverlay}
              onCheckedChange={(tapZoneDebugOverlay) => commit({ tapZoneDebugOverlay })}
            />
            <SettingToggleRow
              id="diagnostics-enabled"
              label="Diagnostics"
              description="Collect reader diagnostics while reading."
              checked={settings.diagnosticsEnabled}
              onCheckedChange={(diagnosticsEnabled) => commit({ diagnosticsEnabled })}
            />
          </div>
        </SettingsSection>
      </section>
    </PageContainer>
  );
}
