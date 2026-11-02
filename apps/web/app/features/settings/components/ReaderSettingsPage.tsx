import {
  Button,
  ErrorState,
  Input,
  Label,
  LoadingState,
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
  PREFETCH_BUDGET_MAX_BYTES,
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
  type TapZoneLayout,
  type WheelBehavior,
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
  { value: 'ltr', label: 'Left to right' },
  { value: 'rtl', label: 'Right to left (manga)' },
  { value: 'vertical', label: 'Vertical (webtoon)' },
];

const PAGE_LAYOUT_OPTIONS: readonly { value: PageLayoutMode; label: string }[] = [
  { value: 'single', label: 'Single page' },
  { value: 'double', label: 'Double page' },
  { value: 'smartSpread', label: 'Smart spread' },
];

const FIT_MODE_OPTIONS: readonly { value: FitMode; label: string }[] = [
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

const PREFETCH_BUDGET_MIB = 1024 * 1024;
/** 2 MiB divides both the 250 MiB default and the 2 GiB cap, so every tick is reachable. */
const PREFETCH_BUDGET_STEP_MIB = 2;

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
      <section aria-label="Reader settings" className="mx-auto w-full max-w-3xl p-6">
        <LoadingState type="list" />
      </section>
    );
  }

  if (isError || settings === undefined) {
    return (
      <section aria-label="Reader settings" className="mx-auto w-full max-w-3xl p-6">
        <ErrorState
          title="Could not load reader settings"
          message="Local reader preferences failed to load. Try again in a moment."
        />
      </section>
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
    <section
      aria-label="Reader settings"
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reader settings</h1>
          <p className="text-sm text-muted-foreground">
            {titleScope !== undefined
              ? 'Reading mode, layout, gestures, and display preferences for this title.'
              : 'Default reading mode, layout, gestures, and display preferences.'}
          </p>
        </div>
        {titleScope !== undefined ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={titleScope.isResetting === true}
            onClick={titleScope.onReset}
          >
            {titleScope.isResetting === true ? 'Resetting…' : 'Reset title settings'}
          </Button>
        ) : null}
      </div>

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
            onChange={(tapZoneLayout) => commit({ tapZoneLayout: tapZoneLayout as TapZoneLayout })}
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
            onChange={(wheelBehavior) => commit({ wheelBehavior: wheelBehavior as WheelBehavior })}
          />
        </div>
      </SettingsSection>

      <KeyboardShortcutsSection settings={settings} onChange={update} onCommit={onInteractionEnd} />

      <GestureSettingsSection settings={settings} onChange={update} onCommit={onInteractionEnd} />

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
            id="brightness"
            label="Brightness"
            value={settings.brightness}
            min={0}
            max={1}
            step={0.05}
            formatValue={(value) => `${Math.round(value * 100)}%`}
            onChange={(brightness) => update({ brightness })}
            onCommit={onInteractionEnd}
          />
          <SettingSliderRow
            id="vertical-gap"
            label="Vertical gap"
            description="Space between strips in vertical reading mode (pixels)."
            value={settings.verticalGapPx}
            min={0}
            max={64}
            step={1}
            formatValue={(value) => `${value}px`}
            onChange={(verticalGapPx) => update({ verticalGapPx })}
            onCommit={onInteractionEnd}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Behavior" description="Device and per-title preferences.">
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
          <SettingToggleRow
            id="remember-per-title"
            label="Remember per-title overrides"
            description="Save reading mode changes per manga when enabled."
            checked={settings.rememberPerTitleOverrides}
            onCheckedChange={(rememberPerTitleOverrides) => commit({ rememberPerTitleOverrides })}
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
            max={10}
            step={1}
            onChange={(preloadAhead) => update({ preloadAhead })}
            onCommit={onInteractionEnd}
          />
          <SettingSliderRow
            id="prefetch-budget"
            label="Prefetch budget"
            description="Stop prefetching after this much newly downloaded data; cached pages are free. Set to 0 for unlimited."
            value={Math.round(settings.prefetchBudgetBytes / PREFETCH_BUDGET_MIB)}
            min={0}
            max={PREFETCH_BUDGET_MAX_BYTES / PREFETCH_BUDGET_MIB}
            step={PREFETCH_BUDGET_STEP_MIB}
            formatValue={(mib) => (mib === 0 ? 'Unlimited' : `${mib} MiB`)}
            onChange={(mib) => update({ prefetchBudgetBytes: mib * PREFETCH_BUDGET_MIB })}
            onCommit={onInteractionEnd}
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
  );
}
