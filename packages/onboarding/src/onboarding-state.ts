import type { AppResult } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';

import { ONBOARDING_STEP_IDS } from './constants.js';
import type { OnboardingState, OnboardingStatus, OnboardingStepId } from './types.js';

const STEP_SET = new Set<string>(ONBOARDING_STEP_IDS);
const STATUS_SET = new Set<OnboardingStatus>(['not_started', 'in_progress', 'completed', 'skipped']);

function isIsoTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function getDefaultOnboardingState(): OnboardingState {
  return {
    status: 'not_started',
    currentStep: 'welcome',
    completedSteps: [],
  };
}

export function validateOnboardingState(input: unknown): AppResult<OnboardingState> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return err(createAppError({ code: 'onboarding.invalid', message: 'Onboarding state must be an object.' }));
  }

  const record = input as Record<string, unknown>;
  const status = record['status'];
  if (typeof status !== 'string' || !STATUS_SET.has(status as OnboardingStatus)) {
    return err(createAppError({ code: 'onboarding.invalid', message: 'Invalid onboarding status.' }));
  }

  const currentStep = record['currentStep'];
  if (typeof currentStep !== 'string' || !STEP_SET.has(currentStep)) {
    return err(createAppError({ code: 'onboarding.invalid', message: 'Invalid onboarding step.' }));
  }

  const completedSteps = record['completedSteps'];
  if (!Array.isArray(completedSteps)) {
    return err(createAppError({ code: 'onboarding.invalid', message: 'completedSteps must be an array.' }));
  }

  for (const step of completedSteps) {
    if (typeof step !== 'string' || !STEP_SET.has(step)) {
      return err(createAppError({ code: 'onboarding.invalid', message: 'Invalid completed step.' }));
    }
  }

  const startedAt = record['startedAt'];
  if (startedAt !== undefined && (typeof startedAt !== 'string' || !isIsoTimestamp(startedAt))) {
    return err(createAppError({ code: 'onboarding.invalid', message: 'startedAt must be an ISO timestamp.' }));
  }

  const completedAt = record['completedAt'];
  if (completedAt !== undefined && (typeof completedAt !== 'string' || !isIsoTimestamp(completedAt))) {
    return err(createAppError({ code: 'onboarding.invalid', message: 'completedAt must be an ISO timestamp.' }));
  }

  const skippedAt = record['skippedAt'];
  if (skippedAt !== undefined && (typeof skippedAt !== 'string' || !isIsoTimestamp(skippedAt))) {
    return err(createAppError({ code: 'onboarding.invalid', message: 'skippedAt must be an ISO timestamp.' }));
  }

  return ok({
    status: status as OnboardingStatus,
    currentStep: currentStep as OnboardingStepId,
    completedSteps: completedSteps as readonly OnboardingStepId[],
    ...(typeof startedAt === 'string' ? { startedAt } : {}),
    ...(typeof completedAt === 'string' ? { completedAt } : {}),
    ...(typeof skippedAt === 'string' ? { skippedAt } : {}),
  });
}

export function isOnboardingFinished(state: OnboardingState): boolean {
  return state.status === 'completed' || state.status === 'skipped';
}

export function getOnboardingStepIndex(step: OnboardingStepId): number {
  return ONBOARDING_STEP_IDS.indexOf(step);
}

export function getOnboardingProgress(state: OnboardingState): { readonly current: number; readonly total: number } {
  const index = getOnboardingStepIndex(state.currentStep);
  return {
    current: index + 1,
    total: ONBOARDING_STEP_IDS.length,
  };
}

export function startOnboarding(state: OnboardingState, now = new Date().toISOString()): OnboardingState {
  if (state.status === 'in_progress') {
    return state;
  }

  return {
    status: 'in_progress',
    currentStep: state.currentStep,
    completedSteps: state.completedSteps,
    startedAt: state.startedAt ?? now,
  };
}

export function replayOnboarding(now = new Date().toISOString()): OnboardingState {
  return {
    status: 'in_progress',
    currentStep: 'welcome',
    completedSteps: [],
    startedAt: now,
  };
}

export function advanceOnboardingStep(state: OnboardingState, now = new Date().toISOString()): OnboardingState {
  const active = startOnboarding(state, now);
  const completedSteps = active.completedSteps.includes(active.currentStep)
    ? active.completedSteps
    : [...active.completedSteps, active.currentStep];

  const currentIndex = getOnboardingStepIndex(active.currentStep);
  const nextStep = ONBOARDING_STEP_IDS[currentIndex + 1];

  if (nextStep === undefined) {
    return completeOnboarding({ ...active, completedSteps }, now);
  }

  return {
    ...active,
    completedSteps,
    currentStep: nextStep,
  };
}

export function retreatOnboardingStep(state: OnboardingState): OnboardingState {
  const active = startOnboarding(state);
  const currentIndex = getOnboardingStepIndex(active.currentStep);
  const previousStep = ONBOARDING_STEP_IDS[currentIndex - 1];

  if (previousStep === undefined) {
    return active;
  }

  return {
    ...active,
    currentStep: previousStep,
  };
}

export function skipOnboarding(state: OnboardingState, now = new Date().toISOString()): OnboardingState {
  return {
    ...startOnboarding(state, now),
    status: 'skipped',
    skippedAt: now,
  };
}

export function completeOnboarding(state: OnboardingState, now = new Date().toISOString()): OnboardingState {
  const active = startOnboarding(state, now);
  const completedSteps = ONBOARDING_STEP_IDS.filter(
    (step) => active.completedSteps.includes(step) || step === active.currentStep,
  );

  return {
    ...active,
    status: 'completed',
    currentStep: 'provider',
    completedSteps,
    completedAt: now,
  };
}

export function resolveOnboardingEntryState(state: OnboardingState): OnboardingState {
  if (isOnboardingFinished(state)) {
    return replayOnboarding();
  }

  if (state.status === 'not_started') {
    return startOnboarding(state);
  }

  return state;
}
