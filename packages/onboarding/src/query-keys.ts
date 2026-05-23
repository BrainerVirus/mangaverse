export const onboardingQueryKeys = {
  all: ['onboarding'] as const,
  state: () => [...onboardingQueryKeys.all, 'state'] as const,
};
