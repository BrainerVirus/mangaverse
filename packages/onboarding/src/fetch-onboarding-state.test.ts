import { describe, expect, it } from 'vitest';
import { getAppSetting } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';

import { ONBOARDING_STORAGE_KEY } from './constants.js';
import { fetchOnboardingState } from './fetch-onboarding-state.js';
import { getDefaultOnboardingState } from './onboarding-state.js';
import { saveOnboardingState } from './save-onboarding-state.js';

describe('onboarding persistence', () => {
  it('returns defaults when nothing is stored', async () => {
    const { db } = await createSqlJsHarness();
    const state = await fetchOnboardingState(db);
    expect(state).toEqual(getDefaultOnboardingState());
  });

  it('persists validated onboarding state', async () => {
    const { db } = await createSqlJsHarness();
    const next = {
      ...getDefaultOnboardingState(),
      status: 'in_progress' as const,
      currentStep: 'reading' as const,
      completedSteps: ['welcome', 'theme'] as const,
      startedAt: '2026-05-23T00:00:00.000Z',
    };

    const result = await saveOnboardingState(db, next);
    expect(result.ok).toBe(true);
    expect(await fetchOnboardingState(db)).toEqual(next);
    expect(await getAppSetting(db, ONBOARDING_STORAGE_KEY)).toEqual(next);
  });

  it('rejects invalid onboarding state', async () => {
    const { db } = await createSqlJsHarness();
    const result = await saveOnboardingState(db, {
      ...getDefaultOnboardingState(),
      currentStep: 'invalid' as never,
    });
    expect(result.ok).toBe(false);
  });
});
