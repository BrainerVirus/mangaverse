/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getDefaultAppSettings, getDefaultReaderSettings } from '@app/shared';
import type { AppSettings, ReaderSettings, ThemeSettings } from '@app/shared';
import { getDefaultThemeSettings } from '@app/theme';

import { OnboardingPage } from './OnboardingPage.js';
import { getDefaultOnboardingState } from '../onboarding-state.js';

const motionPreference = vi.hoisted(() => ({ reduced: true }));

vi.mock('@app/motion', async () => {
  const actual = await vi.importActual('@app/motion');
  return {
    ...actual,
    useReducedMotion: () => motionPreference.reduced,
    fadeIn: vi.fn<(target: unknown, vars?: unknown) => unknown>(),
  };
});

vi.mock('@gsap/react', () => ({
  useGSAP: vi.fn<(callback: () => void) => () => void>((callback) => {
    callback();
    return () => {};
  }),
}));

const baseProps = {
  state: getDefaultOnboardingState(),
  themeSettings: getDefaultThemeSettings(),
  appSettings: getDefaultAppSettings(),
  readerSettings: getDefaultReaderSettings(),
  isLoading: false,
  isError: false,
  onThemeChange: vi.fn<(next: ThemeSettings) => void>(),
  onAppSettingsChange: vi.fn<(next: AppSettings) => void>(),
  onReaderSettingsChange: vi.fn<(next: ReaderSettings) => void>(),
  onSkip: vi.fn<() => void>(),
  onBack: vi.fn<() => void>(),
  onNext: vi.fn<() => void>(),
  onInstallProvider: vi.fn<() => void>(),
  onFinish: vi.fn<() => void>(),
};

describe('OnboardingPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    motionPreference.reduced = true;
    delete document.documentElement.dataset.glass;
    delete document.documentElement.dataset.transparency;
  });

  it('renders the welcome step with progress metadata', () => {
    render(<OnboardingPage {...baseProps} />);

    expect(screen.getByRole('heading', { name: 'Welcome to MangaVerse' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Onboarding progress' })).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
  });

  it('applies displacement glass to the welcome hero when motion is allowed', () => {
    motionPreference.reduced = false;
    document.documentElement.dataset.glass = 'full';

    render(<OnboardingPage {...baseProps} />);

    const hero = screen
      .getByRole('heading', { name: 'Welcome to MangaVerse' })
      .closest('[data-glass-tier="regular"]');
    expect(hero).toBeInTheDocument();
    expect(hero?.querySelector('[data-refraction="displacement"]')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-refraction="displacement"]')).toHaveLength(1);
  });

  it('renders the page as a named section so the shell owns the main landmark', () => {
    render(<OnboardingPage {...baseProps} />);

    expect(document.querySelector('main')).toBeNull();
    expect(screen.getByRole('region', { name: 'Onboarding' })).toBeInTheDocument();
  });

  it('renders design-system Button classes on primary actions', () => {
    render(<OnboardingPage {...baseProps} />);

    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton.className).toContain('inline-flex');
    expect(continueButton.className).toContain('rounded-[var(--radius-btn)]');
  });

  it('exposes skip and continue actions on the first step', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn<() => void>();
    const onNext = vi.fn<() => void>();

    render(<OnboardingPage {...baseProps} onSkip={onSkip} onNext={onNext} />);

    await user.click(screen.getByRole('button', { name: 'Skip setup' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onSkip).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('uses design-system Select triggers instead of native select on reading step', () => {
    render(
      <OnboardingPage
        {...baseProps}
        state={{
          ...getDefaultOnboardingState(),
          status: 'in_progress',
          currentStep: 'reading',
          completedSteps: ['welcome', 'theme'],
        }}
      />,
    );

    expect(document.querySelector('select')).toBeNull();
    expect(screen.getByLabelText('Reading direction')).toBeInTheDocument();
    expect(screen.getByLabelText('Page layout')).toBeInTheDocument();
  });

  it('renders provider install actions on the final step', async () => {
    const user = userEvent.setup();
    const onInstallProvider = vi.fn<() => void>();
    const onFinish = vi.fn<() => void>();

    render(
      <OnboardingPage
        {...baseProps}
        state={{
          ...getDefaultOnboardingState(),
          status: 'in_progress',
          currentStep: 'provider',
          completedSteps: ['welcome', 'theme', 'reading', 'preferences'],
        }}
        onInstallProvider={onInstallProvider}
        onFinish={onFinish}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Install a provider' }));
    await user.click(screen.getByRole('button', { name: 'Finish without provider' }));

    expect(onInstallProvider).toHaveBeenCalledOnce();
    expect(onFinish).toHaveBeenCalledOnce();
  });
});
