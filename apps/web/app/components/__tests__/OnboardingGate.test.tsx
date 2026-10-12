import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

import { OnboardingGate } from '../OnboardingGate.js';

const navigate = vi.fn();
let onboardingState = {
  status: 'not_started' as const,
  currentStep: 'welcome' as const,
  completedSteps: [] as readonly string[],
};
let pathname = '/library';

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname }),
  useNavigate: () => navigate,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: onboardingState,
  }),
}));

vi.mock('../../providers/local-db-provider.js', () => ({
  useLocalDb: () => ({}),
  useLocalDbStatus: () => 'ready' as const,
}));

describe('OnboardingGate', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    navigate.mockReset();
    pathname = '/library';
    onboardingState = {
      status: 'not_started',
      currentStep: 'welcome',
      completedSteps: [],
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('redirects unfinished onboarding users to /onboarding', () => {
    act(() => {
      root.render(
        <OnboardingGate>
          <div>App content</div>
        </OnboardingGate>,
      );
    });

    expect(navigate).toHaveBeenCalledWith({ to: '/onboarding', replace: true });
  });

  it('does not redirect when onboarding is finished', () => {
    onboardingState = {
      status: 'completed',
      currentStep: 'provider',
      completedSteps: ['welcome', 'theme', 'reading', 'preferences', 'provider'],
    };

    act(() => {
      root.render(
        <OnboardingGate>
          <div>App content</div>
        </OnboardingGate>,
      );
    });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not redirect while already on onboarding', () => {
    pathname = '/onboarding';

    act(() => {
      root.render(
        <OnboardingGate>
          <div>Onboarding content</div>
        </OnboardingGate>,
      );
    });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not redirect on nested onboarding paths', () => {
    pathname = '/onboarding/onboarding';

    act(() => {
      root.render(
        <OnboardingGate>
          <div>Onboarding content</div>
        </OnboardingGate>,
      );
    });

    expect(navigate).not.toHaveBeenCalled();
  });
});
