import type { AppDrizzleDb } from '@app/db';
import type { AppResult } from '@app/shared';
import { err, ok } from '@app/shared';

import { ONBOARDING_STORAGE_KEY } from './constants.js';
import { validateOnboardingState } from './onboarding-state.js';
import type { OnboardingState } from './types.js';

export async function saveOnboardingState(db: AppDrizzleDb, state: OnboardingState): Promise<AppResult<void>> {
  const parsed = validateOnboardingState(state);
  if (!parsed.ok) {
    return err(parsed.error);
  }

  const { upsertAppSetting } = await import('@app/db');
  await upsertAppSetting(db, ONBOARDING_STORAGE_KEY, parsed.value);
  return ok(undefined);
}
