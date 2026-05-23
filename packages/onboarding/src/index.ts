export { OnboardingPage, type OnboardingPageProps } from './components/OnboardingPage.js';
export {
  ONBOARDING_STEP_IDS,
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_THEME_PRESET_IDS,
} from './constants.js';
export { fetchOnboardingState } from './fetch-onboarding-state.js';
export {
  advanceOnboardingStep,
  completeOnboarding,
  getDefaultOnboardingState,
  getOnboardingProgress,
  getOnboardingStepIndex,
  isOnboardingFinished,
  replayOnboarding,
  resolveOnboardingEntryState,
  retreatOnboardingStep,
  skipOnboarding,
  startOnboarding,
  validateOnboardingState,
} from './onboarding-state.js';
export { onboardingQueryKeys } from './query-keys.js';
export { saveOnboardingState } from './save-onboarding-state.js';
export type {
  OnboardingPageData,
  OnboardingState,
  OnboardingStatus,
  OnboardingStepId,
} from './types.js';

export const PACKAGE_NAME = '@app/onboarding' as const;
