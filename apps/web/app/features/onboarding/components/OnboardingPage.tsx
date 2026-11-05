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
  Switch,
  ThemePreview,
  PageContainer,
} from '@app/design-system';
import { fadeIn, useReducedMotion } from '@app/design-system/motion';
import type { AppSettings, ReaderSettings, ThemeSettings } from '@app/shared';
import { useGSAP } from '@gsap/react';
import { HardDrive, ShieldCheck, SlidersHorizontal, SkipForward } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import {
  getThemePreset,
  resolveEffectiveDark,
  toThemePreviewDefinitionForPreset,
} from '@/features/theme';

import { ONBOARDING_STEP_IDS, ONBOARDING_THEME_PRESET_IDS } from '../constants.js';
import { getOnboardingProgress, isOnboardingFinished } from '../onboarding-state.js';
import type { OnboardingState, OnboardingStepId } from '../types.js';

interface OnboardingPageProps {
  readonly state: OnboardingState | undefined;
  readonly themeSettings: ThemeSettings | undefined;
  readonly appSettings: AppSettings | undefined;
  readonly readerSettings: ReaderSettings | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isSaving?: boolean;
  onThemeChange: (next: ThemeSettings) => void;
  onAppSettingsChange: (next: AppSettings) => void;
  onReaderSettingsChange: (next: ReaderSettings) => void;
  onSkip: () => void;
  onBack: () => void;
  onNext: () => void;
  onInstallProvider: () => void;
  onFinish: () => void;
}

const LOCALE_OPTIONS = [
  { value: 'system', label: 'System default' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'ja', label: 'Japanese' },
] as const;

const READING_MODE_OPTIONS = [
  { value: 'auto', label: 'Auto (detect per title)' },
  { value: 'ltr', label: 'Left to right' },
  { value: 'rtl', label: 'Right to left (manga)' },
  { value: 'vertical', label: 'Vertical (webtoon)' },
] as const;

const PAGE_LAYOUT_OPTIONS = [
  { value: 'auto', label: 'Auto (spreads in landscape)' },
  { value: 'single', label: 'Single page' },
  { value: 'double', label: 'Double page' },
  { value: 'smartSpread', label: 'Smart spread' },
] as const;

const STEP_LABELS: Record<OnboardingStepId, string> = {
  welcome: 'Welcome',
  theme: 'Theme',
  reading: 'Reading defaults',
  preferences: 'Language & content',
  provider: 'Install a provider',
};

function parsePreferredLanguages(value: string, fallback: readonly string[]): readonly string[] {
  const codes = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^[a-z]{2}(-[A-Z]{2})?$/.test(part));
  return codes.length > 0 ? codes : fallback;
}

function StepPanel({ step, children }: { step: OnboardingStepId; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useGSAP(
    () => {
      if (!ref.current) return;
      fadeIn(ref.current, { reducedMotion });
    },
    { scope: ref, dependencies: [step, reducedMotion] },
  );

  return (
    <div
      ref={ref}
      key={step}
      className="flex flex-col gap-6"
      style={{ opacity: reducedMotion ? 1 : 0 }}
      aria-labelledby={`onboarding-step-${step}`}
    >
      {children}
    </div>
  );
}

const WELCOME_FACTS = [
  {
    icon: HardDrive,
    title: 'Local-first storage',
    description:
      'Library entries, progress, and settings stay in SQLite on your device. Optional cloud sync may come later.',
  },
  {
    icon: ShieldCheck,
    title: 'Extension safety',
    description: 'Providers install only after manifest validation and your explicit confirmation.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Content responsibility',
    description:
      'You choose language and content filters. Providers may expose mature content when enabled.',
  },
  {
    icon: SkipForward,
    title: 'Skip anytime',
    description: 'This setup is optional. You can resume or replay it later from Settings.',
  },
] as const;

function WelcomeStep() {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 id="onboarding-step-welcome" className="type-display-lg text-foreground">
          Welcome to MangaVerse
        </h1>
        <p className="text-base text-muted-foreground">
          A calm, local-first reader for manga, comics, and webtoons. Your library lives on this
          device first.
        </p>
      </header>

      <ul className="flex flex-col gap-5" aria-label="Onboarding highlights">
        {WELCOME_FACTS.map(({ icon: Icon, title, description }) => (
          <li key={title} className="flex items-start gap-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex flex-col gap-1.5">
              <h2 className="type-label text-foreground">{title}</h2>
              <p className="type-body text-muted-foreground">{description}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function ThemeStep({
  settings,
  disabled,
  onChange,
}: {
  settings: ThemeSettings;
  disabled?: boolean;
  onChange: (next: ThemeSettings) => void;
}) {
  const previewDark = resolveEffectiveDark(settings);

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 id="onboarding-step-theme" className="type-title text-foreground">
          Choose your look
        </h1>
        <p className="type-body text-muted-foreground">
          Pick a theme preset and appearance. You can customize further in Theme settings.
        </p>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="onboarding-appearance-heading">
        <h2 id="onboarding-appearance-heading" className="type-heading text-foreground">
          Appearance
        </h2>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="onboarding-dark-mode">Dark appearance</Label>
            <p className="type-body text-muted-foreground">
              Use dark surfaces for low-glare reading.
            </p>
          </div>
          <Switch
            id="onboarding-dark-mode"
            checked={settings.dark}
            disabled={disabled}
            aria-label="Dark appearance"
            onCheckedChange={(dark) => onChange({ ...settings, dark })}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="onboarding-presets-heading">
        <h2 id="onboarding-presets-heading" className="type-heading text-foreground">
          Theme preset
        </h2>
        <div className="grid gap-4 sm:grid-cols-2" aria-label="Theme presets">
          {ONBOARDING_THEME_PRESET_IDS.map((presetId) => {
            const preset = getThemePreset(presetId);
            const selected = settings.themeId === presetId;
            const preview = toThemePreviewDefinitionForPreset(presetId, previewDark);

            return (
              <button
                key={presetId}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                aria-label={`Select ${preset.name} theme`}
                onClick={() => onChange({ ...settings, themeId: presetId })}
                className="flex h-full w-full flex-col items-stretch gap-2 rounded-box border border-transparent p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div
                  className={
                    selected
                      ? 'w-full rounded-box ring-2 ring-primary ring-offset-2 ring-offset-background'
                      : 'w-full rounded-box hover:ring-1 hover:ring-border'
                  }
                >
                  <ThemePreview theme={preview} />
                </div>
                <div className="w-full px-1">
                  <p className="text-sm font-medium text-foreground">{preset.name}</p>
                  <p className="text-sm text-muted-foreground">{preset.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

function SettingsSelectField({
  id,
  label,
  value,
  disabled = false,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
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

function ReadingStep({
  settings,
  disabled,
  onChange,
}: {
  settings: ReaderSettings;
  disabled?: boolean;
  onChange: (next: ReaderSettings) => void;
}) {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 id="onboarding-step-reading" className="type-title text-foreground">
          Reading defaults
        </h1>
        <p className="type-body text-muted-foreground">
          Set the default direction and page layout. Per-title overrides remain available in the
          reader.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <SettingsSelectField
          id="onboarding-reading-mode"
          label="Reading direction"
          value={settings.readingMode}
          disabled={disabled === true}
          options={READING_MODE_OPTIONS}
          onChange={(value) =>
            onChange({ ...settings, readingMode: value as ReaderSettings['readingMode'] })
          }
        />

        <SettingsSelectField
          id="onboarding-page-layout"
          label="Page layout"
          value={settings.pageLayout}
          disabled={disabled === true}
          options={PAGE_LAYOUT_OPTIONS}
          onChange={(value) =>
            onChange({ ...settings, pageLayout: value as ReaderSettings['pageLayout'] })
          }
        />
      </div>
    </>
  );
}

function PreferencesStep({
  settings,
  disabled,
  onChange,
}: {
  settings: AppSettings;
  disabled?: boolean;
  onChange: (next: AppSettings) => void;
}) {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 id="onboarding-step-preferences" className="type-title text-foreground">
          Language and content
        </h1>
        <p className="type-body text-muted-foreground">
          Tune localization and mature content visibility for search and provider results.
        </p>
      </header>

      <section className="flex flex-col gap-4" aria-labelledby="onboarding-language-heading">
        <h2 id="onboarding-language-heading" className="type-heading text-foreground">
          Language
        </h2>
        <SettingsSelectField
          id="onboarding-locale"
          label="App language"
          value={settings.locale}
          disabled={disabled === true}
          options={LOCALE_OPTIONS}
          onChange={(value) => onChange({ ...settings, locale: value })}
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor="onboarding-preferred-languages">Preferred content languages</Label>
          <Input
            id="onboarding-preferred-languages"
            value={settings.preferredLanguages.join(', ')}
            disabled={disabled}
            aria-describedby="onboarding-preferred-languages-help"
            onChange={(event) =>
              onChange({
                ...settings,
                preferredLanguages: parsePreferredLanguages(
                  event.target.value,
                  settings.preferredLanguages,
                ),
              })
            }
          />
          <p id="onboarding-preferred-languages-help" className="type-body text-muted-foreground">
            Comma-separated ISO codes, for example en, ja, es.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="onboarding-content-heading">
        <h2 id="onboarding-content-heading" className="type-heading text-foreground">
          Content
        </h2>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="onboarding-explicit-content">Allow explicit content</Label>
            <p className="type-body text-muted-foreground">
              When disabled, mature results are filtered from search and discovery.
            </p>
          </div>
          <Switch
            id="onboarding-explicit-content"
            checked={settings.explicitContent}
            disabled={disabled}
            aria-label="Allow explicit content"
            onCheckedChange={(explicitContent) => onChange({ ...settings, explicitContent })}
          />
        </div>
      </section>
    </>
  );
}

function ProviderStep({ onInstallProvider }: { onInstallProvider: () => void }) {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 id="onboarding-step-provider" className="type-title text-foreground">
          Add your first provider
        </h1>
        <p className="type-body text-muted-foreground">
          Providers supply catalog search and chapter sources. Install one now or finish setup and
          add providers later from Extensions.
        </p>
      </header>

      <section
        className="flex flex-col items-start gap-4"
        aria-labelledby="onboarding-review-heading"
      >
        <h2 id="onboarding-review-heading" className="type-heading text-foreground">
          Review before installing
        </h2>
        <p className="type-body text-muted-foreground">
          You will review manifest details, permissions, and capabilities before anything is
          installed.
        </p>
        <Button type="button" variant="outline" onClick={onInstallProvider}>
          Open provider install
        </Button>
      </section>
    </>
  );
}

export function OnboardingPage({
  state,
  themeSettings,
  appSettings,
  readerSettings,
  isLoading,
  isError,
  isSaving = false,
  onThemeChange,
  onAppSettingsChange,
  onReaderSettingsChange,
  onSkip,
  onBack,
  onNext,
  onInstallProvider,
  onFinish,
}: OnboardingPageProps) {
  if (isLoading) {
    return (
      <PageContainer variant="read">
        <section aria-label="Onboarding" className="w-full max-w-2xl">
          <LoadingState type="list" />
        </section>
      </PageContainer>
    );
  }

  if (
    isError ||
    state === undefined ||
    themeSettings === undefined ||
    appSettings === undefined ||
    readerSettings === undefined
  ) {
    return (
      <PageContainer variant="read">
        <section aria-label="Onboarding" className="w-full max-w-2xl">
          <ErrorState
            title="Could not load onboarding"
            message="Local setup data failed to load. Try again in a moment."
          />
        </section>
      </PageContainer>
    );
  }

  const progress = getOnboardingProgress(state);
  const isFirstStep = state.currentStep === ONBOARDING_STEP_IDS[0];
  const isLastStep = state.currentStep === 'provider';

  return (
    <PageContainer variant="read">
      <section aria-label="Onboarding" className="flex w-full max-w-2xl flex-col">
        <div className="mb-8 flex items-center justify-between gap-3">
          <nav aria-label="Onboarding steps">
            <p className="text-xs text-muted-foreground sm:hidden">
              Step {progress.current} of {progress.total}
            </p>
            <ol className="type-body hidden gap-x-3 whitespace-nowrap sm:flex">
              {ONBOARDING_STEP_IDS.map((step) => (
                <li
                  key={step}
                  aria-current={step === state.currentStep ? 'step' : undefined}
                  className={
                    step === state.currentStep
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground'
                  }
                >
                  {STEP_LABELS[step]}
                </li>
              ))}
            </ol>
          </nav>
          {!isOnboardingFinished(state) ? (
            <Button type="button" variant="ghost" disabled={isSaving} onClick={onSkip}>
              Skip setup
            </Button>
          ) : null}
        </div>

        <StepPanel step={state.currentStep}>
          {state.currentStep === 'welcome' ? <WelcomeStep /> : null}
          {state.currentStep === 'theme' ? (
            <ThemeStep settings={themeSettings} disabled={isSaving} onChange={onThemeChange} />
          ) : null}
          {state.currentStep === 'reading' ? (
            <ReadingStep
              settings={readerSettings}
              disabled={isSaving}
              onChange={onReaderSettingsChange}
            />
          ) : null}
          {state.currentStep === 'preferences' ? (
            <PreferencesStep
              settings={appSettings}
              disabled={isSaving}
              onChange={onAppSettingsChange}
            />
          ) : null}
          {state.currentStep === 'provider' ? (
            <ProviderStep onInstallProvider={onInstallProvider} />
          ) : null}
        </StepPanel>

        <footer className="sticky bottom-0 mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background pt-4 pb-4">
          {isFirstStep ? null : (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={isSaving}
              onClick={onBack}
            >
              Back
            </Button>
          )}

          <div className="ml-auto flex flex-wrap justify-end gap-2">
            {isLastStep ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  disabled={isSaving}
                  onClick={onFinish}
                >
                  Finish without provider
                </Button>
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={isSaving}
                  onClick={onInstallProvider}
                >
                  Install a provider
                </Button>
              </>
            ) : (
              <Button type="button" className="min-h-11" disabled={isSaving} onClick={onNext}>
                Continue
              </Button>
            )}
          </div>
        </footer>
      </section>
    </PageContainer>
  );
}
