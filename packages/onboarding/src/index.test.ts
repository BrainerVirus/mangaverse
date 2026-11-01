import { describe, expect, it } from 'vitest';

import {
  OnboardingPage,
  advanceOnboardingStep,
  fetchOnboardingState,
  getDefaultOnboardingState,
  saveOnboardingState,
} from './index.js';

describe('@app/onboarding exports', () => {
  it('exports the onboarding feature surface', () => {
    expect(typeof OnboardingPage).toBe('function');
    expect(typeof fetchOnboardingState).toBe('function');
    expect(typeof saveOnboardingState).toBe('function');
    expect(typeof advanceOnboardingStep).toBe('function');
    expect(getDefaultOnboardingState().currentStep).toBe('welcome');
  });
});
