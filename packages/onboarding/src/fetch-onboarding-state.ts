import type { AppDrizzleDb } from '@app/db';

import { ONBOARDING_STORAGE_KEY } from './constants.js';
import { getDefaultOnboardingState, validateOnboardingState } from './onboarding-state.js';
import type { OnboardingState } from './types.js';

export async function fetchOnboardingState(db: AppDrizzleDb): Promise<OnboardingState> {
  const { getAppSetting } = await import('@app/db');
  const raw = await getAppSetting(db, ONBOARDING_STORAGE_KEY);
  if (raw === undefined) {
    return getDefaultOnboardingState();
  }

  const parsed = validateOnboardingState(raw);
  if (!parsed.ok) {
    return getDefaultOnboardingState();
  }

  return parsed.value;
}
