import {
  Button,
  ErrorState,
  Input,
  Label,
  LoadingState,
  Select,
  Switch,
  ThemePreview,
} from '@app/design-system';
import { fadeIn, useReducedMotion } from '@app/motion';
import type { AppSettings, ReaderSettings, ThemeSettings } from '@app/shared';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useRef, type ReactNode } from 'react';
import {
  getThemePreset,
  resolveEffectiveDark,
  toThemePreviewDefinitionForPreset,
} from '@app/theme';

import { ONBOARDING_THEME_PRESET_IDS } from '../constants.js';
import {
  getOnboardingProgress,
  getOnboardingStepIndex,
  isOnboardingFinished,
} from '../onboarding-state.js';
import type { OnboardingState, OnboardingStepId } from '../types.js';

export interface OnboardingPageProps {
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
  { value: 'ltr', label: 'Left to right' },
  { value: 'rtl', label: 'Right to left (manga)' },
  { value: 'vertical', label: 'Vertical (webtoon)' },
] as const;

const PAGE_LAYOUT_OPTIONS = [
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
      if (reducedMotion) {
        gsap.set(ref.current, { autoAlpha: 1, y: 0 });
        return;
      }
      fadeIn(ref.current);
    },
    { scope: ref, dependencies: [step, reducedMotion] },
  );

  return (
    <div
      ref={ref}
      key={step}
      className="space-y-6"
      style={{ opacity: reducedMotion ? 1 : 0 }}
      aria-labelledby={`onboarding-step-${step}`}
    >
      {children}
    </div>
  );
}

function WelcomeStep() {
  return (
    <>
      <header className="space-y-2">
        <h1 id="onboarding-step-welcome" className="text-2xl font-semibold tracking-tight text-foreground">
          Welcome to MangaVerse
        </h1>
        <p className="text-muted-foreground">
          A calm, local-first reader for manga, comics, and webtoons. Your library lives on this device first.
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Onboarding highlights">
        <li className="rounded-[var(--radius-box)] border border-[var(--border)] p-4">
          <h2 className="text-sm font-medium text-foreground">Local-first storage</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Library entries, progress, and settings stay in SQLite on your device. Optional cloud sync may come later.
          </p>
        </li>
        <li className="rounded-[var(--radius-box)] border border-[var(--border)] p-4">
          <h2 className="text-sm font-medium text-foreground">Extension safety</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Providers install only after manifest validation and your explicit confirmation.
          </p>
        </li>
        <li className="rounded-[var(--radius-box)] border border-[var(--border)] p-4">
          <h2 className="text-sm font-medium text-foreground">Content responsibility</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You choose language and content filters. Providers may expose mature content when enabled.
          </p>
        </li>
        <li className="rounded-[var(--radius-box)] border border-[var(--border)] p-4">
          <h2 className="text-sm font-medium text-foreground">Skip anytime</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This setup is optional. You can resume or replay it later from Settings.
          </p>
        </li>
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
      <header className="space-y-2">
        <h2 id="onboarding-step-theme" className="text-xl font-semibold text-foreground">
          Choose your look
        </h2>
        <p className="text-sm text-muted-foreground">
          Pick a theme preset and appearance. You can customize further in Theme settings.
        </p>
      </header>

      <div className="flex items-center justify-between rounded-[var(--radius-control)] border border-[var(--border)] p-4">
        <div>
          <Label htmlFor="onboarding-dark-mode" className="text-sm font-medium">
            Dark appearance
          </Label>
          <p className="text-sm text-muted-foreground">Use dark surfaces for low-glare reading.</p>
        </div>
        <Switch
          id="onboarding-dark-mode"
          checked={settings.dark}
          disabled={disabled}
          aria-label="Dark appearance"
          onClick={() => onChange({ ...settings, dark: !settings.dark })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2" aria-label="Theme presets">
        {ONBOARDING_THEME_PRESET_IDS.map((presetId) => {
          const preset = getThemePreset(presetId);
          const selected = settings.presetId === presetId;
          const preview = toThemePreviewDefinitionForPreset(presetId, previewDark);

          return (
            <button
              key={presetId}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={`Select ${preset.name} theme`}
              onClick={() => onChange({ ...settings, presetId })}
              className="flex flex-col items-start gap-2 rounded-[var(--radius-box)] border border-transparent p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div
                className={
                  selected
                    ? 'rounded-[var(--radius-box)] ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--background)]'
                    : 'rounded-[var(--radius-box)] hover:ring-1 hover:ring-[var(--border)]'
                }
              >
                <ThemePreview theme={preview} />
              </div>
              <div className="px-1">
                <p className="text-sm font-medium text-foreground">{preset.name}</p>
                <p className="text-sm text-muted-foreground">{preset.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </>
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
      <header className="space-y-2">
        <h2 id="onboarding-step-reading" className="text-xl font-semibold text-foreground">
          Reading defaults
        </h2>
        <p className="text-sm text-muted-foreground">
          Set the default direction and page layout. Per-title overrides remain available in the reader.
        </p>
      </header>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="onboarding-reading-mode">Reading direction</Label>
          <Select
            id="onboarding-reading-mode"
            value={settings.readingMode}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...settings, readingMode: event.target.value as ReaderSettings['readingMode'] })
            }
          >
            {READING_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="onboarding-page-layout">Page layout</Label>
          <Select
            id="onboarding-page-layout"
            value={settings.pageLayout}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...settings, pageLayout: event.target.value as ReaderSettings['pageLayout'] })
            }
          >
            {PAGE_LAYOUT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
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
      <header className="space-y-2">
        <h2 id="onboarding-step-preferences" className="text-xl font-semibold text-foreground">
          Language and content
        </h2>
        <p className="text-sm text-muted-foreground">
          Tune localization and mature content visibility for search and provider results.
        </p>
      </header>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="onboarding-locale">App language</Label>
          <Select
            id="onboarding-locale"
            value={settings.locale}
            disabled={disabled}
            onChange={(event) => onChange({ ...settings, locale: event.target.value })}
          >
            {LOCALE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="onboarding-preferred-languages">Preferred content languages</Label>
          <Input
            id="onboarding-preferred-languages"
            value={settings.preferredLanguages.join(', ')}
            disabled={disabled}
            aria-describedby="onboarding-preferred-languages-help"
            onChange={(event) =>
              onChange({
                ...settings,
                preferredLanguages: parsePreferredLanguages(event.target.value, settings.preferredLanguages),
              })
            }
          />
          <p id="onboarding-preferred-languages-help" className="text-sm text-muted-foreground">
            Comma-separated ISO codes, for example en, ja, es.
          </p>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-[var(--radius-control)] border border-[var(--border)] p-4">
          <div className="space-y-1">
            <Label htmlFor="onboarding-explicit-content" className="text-sm font-medium">
              Allow explicit content
            </Label>
            <p className="text-sm text-muted-foreground">
              When disabled, mature results are filtered from search and discovery.
            </p>
          </div>
          <Switch
            id="onboarding-explicit-content"
            checked={settings.explicitContent}
            disabled={disabled}
            aria-label="Allow explicit content"
            onClick={() => onChange({ ...settings, explicitContent: !settings.explicitContent })}
          />
        </div>
      </div>
    </>
  );
}

function ProviderStep({ onInstallProvider }: { onInstallProvider: () => void }) {
  return (
    <>
      <header className="space-y-2">
        <h2 id="onboarding-step-provider" className="text-xl font-semibold text-foreground">
          Add your first provider
        </h2>
        <p className="text-sm text-muted-foreground">
          Providers supply catalog search and chapter sources. Install one now or finish setup and add providers later
          from Extensions.
        </p>
      </header>

      <div className="rounded-[var(--radius-box)] border border-[var(--border)] p-4">
        <p className="text-sm text-muted-foreground">
          You will review manifest details, permissions, and capabilities before anything is installed.
        </p>
        <Button type="button" className="mt-4" onClick={onInstallProvider}>
          Open provider install
        </Button>
      </div>
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
      <main className="mx-auto w-full max-w-3xl p-6">
        <LoadingState type="list" />
      </main>
    );
  }

  if (isError || state === undefined || themeSettings === undefined || appSettings === undefined || readerSettings === undefined) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <ErrorState
          title="Could not load onboarding"
          message="Local setup data failed to load. Try again in a moment."
        />
      </main>
    );
  }

  const progress = getOnboardingProgress(state);
  const stepIndex = getOnboardingStepIndex(state.currentStep);
  const isFirstStep = stepIndex === 0;
  const isLastStep = state.currentStep === 'provider';

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <div className="mb-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            Step {progress.current} of {progress.total}
          </p>
          {!isOnboardingFinished(state) ? (
            <Button type="button" variant="ghost" disabled={isSaving} onClick={onSkip}>
              Skip setup
            </Button>
          ) : null}
        </div>

        <div
          className="h-2 overflow-hidden rounded-full bg-[var(--accent)]"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={progress.total}
          aria-valuenow={progress.current}
          aria-label="Onboarding progress"
        >
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
            style={{ width: `${(progress.current / progress.total) * 100}%` }}
          />
        </div>

        <nav aria-label="Onboarding steps">
          <ol className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {(['welcome', 'theme', 'reading', 'preferences', 'provider'] as const).map((step, index) => {
              const isActive = step === state.currentStep;
              const isComplete = state.completedSteps.includes(step) || index < stepIndex;
              return (
                <li
                  key={step}
                  aria-current={isActive ? 'step' : undefined}
                  className={
                    isActive
                      ? 'rounded-full bg-[var(--accent)] px-2 py-1 font-medium text-foreground'
                      : isComplete
                        ? 'rounded-full px-2 py-1 text-foreground'
                        : 'rounded-full px-2 py-1'
                  }
                >
                  {STEP_LABELS[step]}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      <StepPanel step={state.currentStep}>
        {state.currentStep === 'welcome' ? <WelcomeStep /> : null}
        {state.currentStep === 'theme' ? (
          <ThemeStep settings={themeSettings} disabled={isSaving} onChange={onThemeChange} />
        ) : null}
        {state.currentStep === 'reading' ? (
          <ReadingStep settings={readerSettings} disabled={isSaving} onChange={onReaderSettingsChange} />
        ) : null}
        {state.currentStep === 'preferences' ? (
          <PreferencesStep settings={appSettings} disabled={isSaving} onChange={onAppSettingsChange} />
        ) : null}
        {state.currentStep === 'provider' ? <ProviderStep onInstallProvider={onInstallProvider} /> : null}
      </StepPanel>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-6">
        <Button type="button" variant="outline" disabled={isSaving || isFirstStep} onClick={onBack}>
          Back
        </Button>

        <div className="flex flex-wrap gap-2">
          {isLastStep ? (
            <>
              <Button type="button" variant="secondary" disabled={isSaving} onClick={onFinish}>
                Finish without provider
              </Button>
              <Button type="button" disabled={isSaving} onClick={onInstallProvider}>
                Install a provider
              </Button>
            </>
          ) : (
            <Button type="button" disabled={isSaving} onClick={onNext}>
              Continue
            </Button>
          )}
        </div>
      </footer>
    </main>
  );
}
