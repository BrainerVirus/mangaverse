import { describe, expect, it } from 'vitest';

import {
  advanceOnboardingStep,
  completeOnboarding,
  getDefaultOnboardingState,
  getOnboardingProgress,
  resolveOnboardingEntryState,
  retreatOnboardingStep,
  skipOnboarding,
  startOnboarding,
  validateOnboardingState,
} from './onboarding-state.js';

describe('onboarding state machine', () => {
  it('returns stable defaults', () => {
    expect(getDefaultOnboardingState()).toEqual({
      status: 'not_started',
      currentStep: 'welcome',
      completedSteps: [],
    });
  });

  it('starts and advances through steps', () => {
    let state = getDefaultOnboardingState();
    state = startOnboarding(state, '2026-05-23T00:00:00.000Z');
    expect(state.status).toBe('in_progress');
    expect(state.startedAt).toBe('2026-05-23T00:00:00.000Z');

    state = advanceOnboardingStep(state, '2026-05-23T00:00:01.000Z');
    expect(state.currentStep).toBe('theme');
    expect(state.completedSteps).toEqual(['welcome']);

    state = advanceOnboardingStep(state, '2026-05-23T00:00:02.000Z');
    expect(state.currentStep).toBe('reading');
  });

  it('completes on the final step', () => {
    let state = {
      ...getDefaultOnboardingState(),
      status: 'in_progress' as const,
      currentStep: 'provider' as const,
      completedSteps: ['welcome', 'theme', 'reading', 'preferences'] as const,
      startedAt: '2026-05-23T00:00:00.000Z',
    };

    state = advanceOnboardingStep(state, '2026-05-23T00:00:05.000Z');
    expect(state.status).toBe('completed');
    expect(state.completedAt).toBe('2026-05-23T00:00:05.000Z');
    expect(state.completedSteps).toEqual(['welcome', 'theme', 'reading', 'preferences', 'provider']);
  });

  it('supports skipping setup', () => {
    const skipped = skipOnboarding(getDefaultOnboardingState(), '2026-05-23T00:00:00.000Z');
    expect(skipped.status).toBe('skipped');
    expect(skipped.skippedAt).toBe('2026-05-23T00:00:00.000Z');
  });

  it('retreats to the previous step', () => {
    const state = retreatOnboardingStep({
      ...getDefaultOnboardingState(),
      status: 'in_progress',
      currentStep: 'reading',
      completedSteps: ['welcome', 'theme'],
    });

    expect(state.currentStep).toBe('theme');
  });

  it('replays finished flows from settings', () => {
    const replayed = resolveOnboardingEntryState(
      completeOnboarding({
        ...getDefaultOnboardingState(),
        status: 'in_progress',
        currentStep: 'provider',
        completedSteps: ['welcome', 'theme', 'reading', 'preferences'],
      }),
    );

    expect(replayed.status).toBe('in_progress');
    expect(replayed.currentStep).toBe('welcome');
    expect(replayed.completedSteps).toEqual([]);
    expect(replayed.startedAt).toBeTypeOf('string');
  });

  it('reports progress for the active step', () => {
    expect(
      getOnboardingProgress({
        ...getDefaultOnboardingState(),
        currentStep: 'preferences',
      }),
    ).toEqual({ current: 4, total: 5 });
  });
});

describe('validateOnboardingState', () => {
  it('accepts a valid state object', () => {
    const result = validateOnboardingState({
      status: 'in_progress',
      currentStep: 'theme',
      completedSteps: ['welcome'],
      startedAt: '2026-05-23T00:00:00.000Z',
    });

    expect(result.ok).toBe(true);
  });

  it('rejects invalid step ids', () => {
    const result = validateOnboardingState({
      status: 'in_progress',
      currentStep: 'invalid',
      completedSteps: [],
    });

    expect(result.ok).toBe(false);
  });
});
