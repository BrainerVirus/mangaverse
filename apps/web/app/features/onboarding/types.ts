import type { ONBOARDING_STEP_IDS } from './constants.js';

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

export interface OnboardingState {
  readonly status: OnboardingStatus;
  readonly currentStep: OnboardingStepId;
  readonly completedSteps: readonly OnboardingStepId[];
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly skippedAt?: string;
}

export interface OnboardingPageData {
  readonly state: OnboardingState;
}
