/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getDefaultAppSettings, getDefaultReaderSettings } from '@app/shared';
import type { AppSettings, ReaderSettings, ThemeSettings } from '@app/shared';
import { getDefaultThemeSettings } from '@/features/theme';

import { OnboardingPage } from './OnboardingPage.js';
import { getDefaultOnboardingState } from '../onboarding-state.js';

const motionPreference = vi.hoisted(() => ({ reduced: true }));

vi.mock('@app/design-system/motion', async () => {
  const actual = await vi.importActual('@app/design-system/motion');
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

  it('renders the welcome step with a single step list marking the current step', () => {
    render(<OnboardingPage {...baseProps} />);

    expect(screen.getByRole('heading', { name: 'Welcome to MangaVerse' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();

    const steps = within(screen.getByRole('navigation', { name: 'Onboarding steps' })).getAllByRole(
      'listitem',
    );
    expect(steps.map((step) => step.textContent)).toEqual([
      'Welcome',
      'Theme',
      'Reading defaults',
      'Language & content',
      'Install a provider',
    ]);
    expect(steps[0]).toHaveAttribute('aria-current', 'step');
    expect(steps[1]).not.toHaveAttribute('aria-current');
  });

  it('lists the welcome facts flat, without a glass hero or bordered cards', () => {
    motionPreference.reduced = false;
    document.documentElement.dataset.glass = 'full';

    render(<OnboardingPage {...baseProps} />);

    expect(document.querySelector('[data-glass-tier]')).toBeNull();
    expect(document.querySelector('[data-refraction]')).toBeNull();

    const facts = within(screen.getByRole('list', { name: 'Onboarding highlights' })).getAllByRole(
      'listitem',
    );
    expect(facts).toHaveLength(4);
    for (const fact of facts) {
      expect(fact.className).not.toContain('border');
    }
    expect(screen.getByRole('heading', { name: 'Local-first storage' })).toBeInTheDocument();
  });

  it('constrains the flow to a focused column', () => {
    render(<OnboardingPage {...baseProps} />);

    expect(screen.getByRole('region', { name: 'Onboarding' })).toHaveClass('max-w-2xl');
  });

  it('hides Back on the first step and shows it afterwards', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn<() => void>();
    const { rerender } = render(<OnboardingPage {...baseProps} onBack={onBack} />);

    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

    rerender(
      <OnboardingPage
        {...baseProps}
        onBack={onBack}
        state={{
          ...getDefaultOnboardingState(),
          status: 'in_progress',
          currentStep: 'theme',
          completedSteps: ['welcome'],
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledOnce();
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
