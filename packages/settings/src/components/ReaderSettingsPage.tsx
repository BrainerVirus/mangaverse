import {
  ErrorState,
  Input,
  Label,
  LoadingState,
  Select,
  SettingsSection,
  Slider,
  Switch,
} from '@app/design-system';
import type {
  FitMode,
  NavigationDirection,
  PageLayoutMode,
  PageTransitionMode,
  ReaderChromeVisibility,
  ReaderSettings,
  ReadingMode,
  TapZoneLayout,
  WheelBehavior,
} from '@app/shared';

export interface ReaderSettingsPageProps {
  readonly settings: ReaderSettings | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isSaving?: boolean;
  onChange: (next: ReaderSettings) => void;
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
    <div className="flex items-start justify-between gap-4 rounded-[var(--radius-control)] border border-[var(--border)] p-4">
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
      <Select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
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
}: ReaderSettingsPageProps) {
  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <LoadingState type="list" />
      </main>
    );
  }

  if (isError || settings === undefined) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <ErrorState
          title="Could not load reader settings"
          message="Local reader preferences failed to load. Try again in a moment."
        />
      </main>
    );
  }

  const update = (patch: Partial<ReaderSettings>) => {
    onChange({ ...settings, ...patch });
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
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
            disabled={isSaving}
            options={READING_MODE_OPTIONS}
            onChange={(readingMode) => update({ readingMode: readingMode as ReadingMode })}
          />
          <SettingSelectRow
            id="page-layout"
            label="Page layout"
            description="How many pages appear at once in paged modes."
            value={settings.pageLayout}
            disabled={isSaving}
            options={PAGE_LAYOUT_OPTIONS}
            onChange={(pageLayout) => update({ pageLayout: pageLayout as PageLayoutMode })}
          />
          <SettingSelectRow
            id="fit-mode"
            label="Page fit"
            value={settings.fitMode}
            disabled={isSaving}
            options={FIT_MODE_OPTIONS}
            onChange={(fitMode) => update({ fitMode: fitMode as FitMode })}
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
            disabled={isSaving}
            options={TAP_ZONE_OPTIONS}
            onChange={(tapZoneLayout) => update({ tapZoneLayout: tapZoneLayout as TapZoneLayout })}
          />
          <SettingSelectRow
            id="navigation-direction"
            label="Navigation direction"
            value={settings.navigationDirection}
            disabled={isSaving}
            options={NAV_DIRECTION_OPTIONS}
            onChange={(navigationDirection) =>
              update({ navigationDirection: navigationDirection as NavigationDirection })
            }
          />
          <SettingSelectRow
            id="wheel-behavior"
            label="Mouse wheel"
            value={settings.wheelBehavior}
            disabled={isSaving}
            options={WHEEL_BEHAVIOR_OPTIONS}
            onChange={(wheelBehavior) => update({ wheelBehavior: wheelBehavior as WheelBehavior })}
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
            disabled={isSaving}
            options={CHROME_VISIBILITY_OPTIONS}
            onChange={(chromeVisibility) =>
              update({ chromeVisibility: chromeVisibility as ReaderChromeVisibility })
            }
          />
          <SettingSelectRow
            id="page-transition"
            label="Page transition"
            value={settings.pageTransition}
            disabled={isSaving}
            options={PAGE_TRANSITION_OPTIONS}
            onChange={(pageTransition) => update({ pageTransition: pageTransition as PageTransitionMode })}
          />
          <div className="grid gap-2">
            <Label htmlFor="background-color">Background color</Label>
            <Input
              id="background-color"
              type="color"
              value={settings.backgroundColor}
              disabled={isSaving}
              className="h-10 w-20 cursor-pointer p-1"
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
            disabled={isSaving}
            formatValue={(value) => `${Math.round(value * 100)}%`}
            onChange={(brightness) => update({ brightness })}
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
            disabled={isSaving}
            onChange={(preloadAhead) => update({ preloadAhead })}
          />
          <SettingSliderRow
            id="vertical-gap"
            label="Vertical gap"
            description="Space between strips in vertical reading mode (pixels)."
            value={settings.verticalGapPx}
            min={0}
            max={64}
            step={1}
            disabled={isSaving}
            formatValue={(value) => `${value}px`}
            onChange={(verticalGapPx) => update({ verticalGapPx })}
          />
          <SettingToggleRow
            id="low-memory-mode"
            label="Low-memory mode"
            description="Reduce preloading and image quality on constrained devices."
            checked={settings.lowMemoryMode}
            disabled={isSaving}
            onCheckedChange={(lowMemoryMode) => update({ lowMemoryMode })}
          />
          <SettingToggleRow
            id="long-strip-optimization"
            label="Long strip optimization"
            description="Optimize rendering for very long vertical chapters."
            checked={settings.longStripOptimization}
            disabled={isSaving}
            onCheckedChange={(longStripOptimization) => update({ longStripOptimization })}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Behavior" description="Device and per-title preferences.">
        <SettingToggleRow
          id="keep-screen-on"
          label="Keep screen on"
          description="Prevent the display from sleeping while reading."
          checked={settings.keepScreenOn}
          disabled={isSaving}
          onCheckedChange={(keepScreenOn) => update({ keepScreenOn })}
        />
        <SettingToggleRow
          id="fullscreen-on-open"
          label="Fullscreen on open"
          description="Enter fullscreen when opening the reader."
          checked={settings.fullscreenOnOpen}
          disabled={isSaving}
          onCheckedChange={(fullscreenOnOpen) => update({ fullscreenOnOpen })}
        />
        <SettingToggleRow
          id="image-smoothing"
          label="Image smoothing"
          description="Apply browser filtering when scaling page images."
          checked={settings.imageSmoothing}
          disabled={isSaving}
          onCheckedChange={(imageSmoothing) => update({ imageSmoothing })}
        />
        <SettingToggleRow
          id="remember-per-title"
          label="Remember per-title overrides"
          description="Save reading mode changes per manga when enabled."
          checked={settings.rememberPerTitleOverrides}
          disabled={isSaving}
          onCheckedChange={(rememberPerTitleOverrides) => update({ rememberPerTitleOverrides })}
        />
      </SettingsSection>
    </main>
  );
}
