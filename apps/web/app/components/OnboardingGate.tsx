import { useEffect } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { fetchOnboardingState, isOnboardingFinished, onboardingQueryKeys } from '@app/onboarding';

import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

export function OnboardingGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();

  const onboardingQuery = useQuery({
    queryKey: onboardingQueryKeys.state(),
    queryFn: () => fetchOnboardingState(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-redirect: redirecting is a router side effect that may only fire after the onboarding query resolves; rendering nothing would flash the wrong route, and navigating during render is not allowed.
  useEffect(() => {
    if (dbStatus !== 'ready' || onboardingQuery.data === undefined) {
      return;
    }

    if (isOnboardingFinished(onboardingQuery.data)) {
      return;
    }

    if (location.pathname.startsWith('/onboarding')) {
      return;
    }

    void navigate({ to: '/onboarding', replace: true });
  }, [dbStatus, location.pathname, navigate, onboardingQuery.data]);

  return children;
}
