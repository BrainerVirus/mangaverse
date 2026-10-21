import {
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
import {
  PREFETCH_BUDGET_MAX_BYTES,
  type FitMode,
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
  readonly isSaving?: boolean;
  onChange: (next: ReaderSettings) => void;
  /** Pointer-up or blur: commit a coalesced edit without waiting for the quiet window. */
  onInteractionEnd?: () => void;
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

export function ReaderSettingsPage({
  settings,
  isLoading,
  isError,
  isSaving = false,
  onChange,
  onInteractionEnd,
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
    onChange({ ...settings, ...patch });
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reader settings</h1>
        <p className="text-sm text-muted-foreground">
          Default reading mode, layout, gestures, and display preferences.
          {isSaving ? ' Saving…' : null}
        </p>
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
