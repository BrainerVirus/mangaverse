import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Label,
  SettingsSection,
  Slider,
} from '@app/design-system';
import type { ReactElement } from 'react';
import type { ThemeDefinition, ThemeSeedTokenName } from '@app/shared';

import type { ThemeAppearance } from '../tokens.js';
import type { ThemeEditorPanelProps } from './theme-editor-panel.js';
import {
  BODY_TEXT_TARGET,
  GUIDED_APPEARANCES,
  GUIDED_SEED_FIELDS,
  buildContrastPairs,
  describeContrast,
  fixContrastPair,
  readGuidedOklch,
  readSurfaceWarmth,
  readTextContrast,
  setSeedChannel,
  withSurfaceWarmth,
  withTextContrast,
  type GuidedContrastPair,
  type GuidedSeedField,
} from './theme-guided.js';

// The view fragments below are plain render helpers, not components: they hold no
// state, so calling them keeps the panel hook-free and every control inspectable.

/** A decorative colour swatch; `fill` carries the runtime color without inline CSS. */
function swatch(value: string, className: string): ReactElement {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 1 1" className={className}>
      <rect width="1" height="1" fill={value} />
    </svg>
  );
}

interface GuidedSliderRowProps {
  readonly id: string;
  readonly label: string;
  readonly ariaLabel: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly display: string;
  readonly disabled: boolean;
  readonly onChange: (value: number) => void;
}

function sliderRow({
  id,
  label,
  ariaLabel,
  value,
  min,
  max,
  step,
  display,
  disabled,
  onChange,
}: GuidedSliderRowProps): ReactElement {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-sm tabular-nums text-muted-foreground">{display}</span>
      </div>
      <Slider
        id={id}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

interface SeedControlProps {
  readonly seed: string;
  readonly field: GuidedSeedField;
  readonly value: string;
  readonly appearance: ThemeAppearance;
  readonly disabled: boolean;
  readonly onChange: (patch: { l?: number; c?: number; h?: number }) => void;
}

function seedControl({ seed, field, value, appearance, disabled, onChange }: SeedControlProps) {
  const oklch = readGuidedOklch(value);
  if (oklch === undefined) {
    return null;
  }
  const base = `guided-${appearance}-${seed}`;

  return (
    <div
      key={seed}
      data-testid={`seed-${appearance}-${seed}`}
      className="space-y-2 rounded-control border border-border p-3"
    >
      <div className="flex items-center gap-2">
        {swatch(value, 'h-4 w-4 shrink-0 rounded-full border border-border')}
        <p className="type-label text-foreground">{field.label}</p>
        <span className="ml-auto hidden font-mono text-xs text-muted-foreground sm:inline">
          {`L ${oklch.l.toFixed(2)} C ${oklch.c.toFixed(2)} H ${Math.round(oklch.h)}`}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{field.description}</p>
      {sliderRow({
        id: `${base}-l`,
        label: 'Lightness',
        ariaLabel: `${field.label} lightness`,
        value: oklch.l,
        min: 0,
        max: 1,
        step: 0.01,
        display: oklch.l.toFixed(2),
        disabled,
        onChange: (lightness) => onChange({ l: lightness }),
      })}
      {sliderRow({
        id: `${base}-c`,
        label: 'Chroma',
        ariaLabel: `${field.label} chroma`,
        value: oklch.c,
        min: 0,
        max: 0.37,
        step: 0.005,
        display: oklch.c.toFixed(3),
        disabled,
        onChange: (chroma) => onChange({ c: chroma }),
      })}
      {sliderRow({
        id: `${base}-h`,
        label: 'Hue',
        ariaLabel: `${field.label} hue`,
        value: Math.round(oklch.h),
        min: 0,
        max: 360,
        step: 1,
        display: `${Math.round(oklch.h)}°`,
        disabled,
        onChange: (hue) => onChange({ h: hue }),
      })}
    </div>
  );
}

function formatWarmth(warmth: number): string {
  if (warmth === 50) {
    return 'Neutral';
  }
  return warmth > 50 ? `${warmth - 50}% warm` : `${50 - warmth}% cool`;
}

interface ContrastMeterProps {
  readonly pair: GuidedContrastPair;
  readonly draft: ThemeDefinition;
  readonly appearance: ThemeAppearance;
  readonly disabled: boolean;
  readonly onChange: (next: ThemeDefinition) => void;
}

function contrastMeter({ pair, draft, appearance, disabled, onChange }: ContrastMeterProps) {
  const base = `contrast-${appearance}-${pair.id}`;

  return (
    <li
      key={pair.id}
      data-testid={base}
      className="space-y-2 rounded-control border border-border p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-label text-foreground">{pair.label}</p>
        <p className="text-sm tabular-nums text-muted-foreground">
          {`${pair.ratio.toFixed(2)}:1 · ${pair.statusLabel}`}
        </p>
      </div>
      <div className="flex items-center gap-2" aria-hidden="true">
        {swatch(pair.background, 'h-6 flex-1 rounded-control')}
        {swatch(pair.foreground, 'h-6 flex-1 rounded-control')}
      </div>
      {pair.passes ? (
        <p className="text-sm text-muted-foreground">
          {`Meets the ${BODY_TEXT_TARGET}:1 body-text target.`}
        </p>
      ) : (
        <div className="space-y-2">
          <p id={`${base}-hint`} className="text-sm text-muted-foreground">
            {pair.fixHint}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={`Fix ${pair.label}`}
            aria-describedby={`${base}-hint`}
            onClick={() => {
              const fix = fixContrastPair(draft, appearance, pair.id);
              if (fix !== undefined) {
                onChange(fix.definition);
              }
            }}
          >
            Fix contrast
          </Button>
        </div>
      )}
    </li>
  );
}

export interface GuidedAppearancePanelProps {
  readonly draft: ThemeDefinition;
  readonly appearance: ThemeAppearance;
  onChange: (next: ThemeDefinition) => void;
  readonly disabled?: boolean;
}

/** One appearance's seeds, accent/surface feel and contrast meters. */
export function GuidedAppearancePanel({
  draft,
  appearance,
  onChange,
  disabled = false,
}: GuidedAppearancePanelProps) {
  const seeds = draft[appearance].seeds;
  const accent = readGuidedOklch(seeds.accent) ?? { l: 0.5, c: 0, h: 0 };
  const warmth = readSurfaceWarmth(seeds);
  const textContrast = readTextContrast(seeds);
  const textStatus = describeContrast(textContrast);
  const pairs = buildContrastPairs(draft, appearance);
  const attention = pairs.filter((pair) => !pair.passes);
  const setSeed = (seed: ThemeSeedTokenName, patch: { l?: number; c?: number; h?: number }) =>
    onChange(setSeedChannel(draft, appearance, seed, patch));

  return (
    <div className="space-y-4">
      <SettingsSection
        title="Seeds"
        description="Every other token is derived from these ten colors. The preview above updates as you drag."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {GUIDED_SEED_FIELDS.map((field) =>
            seedControl({
              seed: field.name,
              field,
              value: seeds[field.name],
              appearance,
              disabled,
              onChange: (patch) => setSeed(field.name, patch),
            }),
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Accent and surfaces"
        description="Plain-language feel controls that move the accent and surface seeds."
      >
        <div className="space-y-4">
          {sliderRow({
            id: `guided-${appearance}-accent-h`,
            label: 'Accent hue',
            ariaLabel: 'Accent hue',
            value: Math.round(accent.h),
            min: 0,
            max: 360,
            step: 1,
            display: `${Math.round(accent.h)}°`,
            disabled,
            onChange: (hue) => setSeed('accent', { h: hue }),
          })}
          {sliderRow({
            id: `guided-${appearance}-accent-c`,
            label: 'Accent chroma',
            ariaLabel: 'Accent chroma',
            value: accent.c,
            min: 0,
            max: 0.37,
            step: 0.005,
            display: accent.c.toFixed(3),
            disabled,
            onChange: (chroma) => setSeed('accent', { c: chroma }),
          })}
          {sliderRow({
            id: `guided-${appearance}-warmth`,
            label: 'Surface warmth',
            ariaLabel: 'Surface warmth',
            value: warmth,
            min: 0,
            max: 100,
            step: 1,
            display: formatWarmth(warmth),
            disabled,
            onChange: (value) => onChange(withSurfaceWarmth(draft, appearance, value)),
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Contrast"
        description="WCAG 2.1 ratios for the text and glass pairs this theme paints."
      >
        <div className="space-y-4">
          {sliderRow({
            id: `guided-${appearance}-text-contrast`,
            label: 'Text contrast',
            ariaLabel: 'Text contrast level',
            value: Math.min(textContrast, 7),
            min: 3,
            max: 7,
            step: 0.1,
            display: `${textContrast.toFixed(1)}:1 · ${textStatus.label}`,
            disabled,
            onChange: (target) => onChange(withTextContrast(draft, appearance, target)),
          })}
          {attention.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {`Every pair meets the ${BODY_TEXT_TARGET}:1 body-text target.`}
            </p>
          ) : (
            <Alert>
              <AlertTitle>
                {attention.length === 1
                  ? '1 pair needs attention'
                  : `${attention.length} pairs need attention`}
              </AlertTitle>
              <AlertDescription>
                {`${attention.map((pair) => pair.label).join(', ')}. You can still save; the preview shows these colors as they are and nothing is blocked.`}
              </AlertDescription>
            </Alert>
          )}
          <ul className="space-y-3" aria-label={`Contrast checks for the ${appearance} appearance`}>
            {pairs.map((pair) => contrastMeter({ pair, draft, appearance, disabled, onChange }))}
          </ul>
        </div>
      </SettingsSection>
    </div>
  );
}

/**
 * Guided colour controls: seeds, the accent/surface feel and live contrast meters.
 * The shell owns preview, save and delete; every edit goes through `onChange`.
 */
export function ThemeGuidedEditor({ draft, onChange, disabled = false }: ThemeEditorPanelProps) {
  return (
    <div data-testid="theme-guided-editor" className="space-y-4">
      <p className="type-body text-muted-foreground">
        Pick the seeds and tune the accent, surface and contrast feel. The light and dark previews
        above update immediately, and you can save at any time.
      </p>
      {GUIDED_APPEARANCES.map((appearance) => (
        <section
          key={appearance}
          aria-labelledby={`guided-${appearance}-heading`}
          className="space-y-3"
        >
          <h2 id={`guided-${appearance}-heading`} className="text-lg font-semibold text-foreground">
            {appearance === 'light' ? 'Light appearance' : 'Dark appearance'}
          </h2>
          <GuidedAppearancePanel
            draft={draft}
            appearance={appearance}
            onChange={onChange}
            disabled={disabled}
          />
        </section>
      ))}
    </div>
  );
}
