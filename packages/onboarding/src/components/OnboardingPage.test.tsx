/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getDefaultAppSettings, getDefaultReaderSettings } from '@app/shared';
import { getDefaultThemeSettings } from '@app/theme';

import { OnboardingPage } from './OnboardingPage.js';
import { getDefaultOnboardingState } from '../onboarding-state.js';

vi.mock('@app/motion', async () => {
  const actual = await vi.importActual('@app/motion');
  return {
    ...actual,
    useReducedMotion: () => true,
    fadeIn: vi.fn(),
  };
});

vi.mock('@gsap/react', () => ({
  useGSAP: vi.fn((callback) => {
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
  onThemeChange: vi.fn(),
  onAppSettingsChange: vi.fn(),
  onReaderSettingsChange: vi.fn(),
  onSkip: vi.fn(),
  onBack: vi.fn(),
  onNext: vi.fn(),
  onInstallProvider: vi.fn(),
  onFinish: vi.fn(),
};

describe('OnboardingPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the welcome step with progress metadata', () => {
    render(<OnboardingPage {...baseProps} />);

    expect(screen.getByRole('heading', { name: 'Welcome to MangaVerse' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Onboarding progress' })).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
  });

  it('renders design-system Button classes on primary actions', () => {
    render(<OnboardingPage {...baseProps} />);

    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton.className).toContain('inline-flex');
    expect(continueButton.className).toContain('rounded-[var(--radius-btn)]');
  });

  it('exposes skip and continue actions on the first step', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    const onNext = vi.fn();

    render(<OnboardingPage {...baseProps} onSkip={onSkip} onNext={onNext} />);

    await user.click(screen.getByRole('button', { name: 'Skip setup' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onSkip).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('renders provider install actions on the final step', async () => {
    const user = userEvent.setup();
    const onInstallProvider = vi.fn();
    const onFinish = vi.fn();

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
