import { useEffect } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  fetchOnboardingState,
  isOnboardingFinished,
  onboardingQueryKeys,
} from '@app/onboarding';

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

  useEffect(() => {
    if (dbStatus !== 'ready' || onboardingQuery.data === undefined) {
      return;
    }

    if (isOnboardingFinished(onboardingQuery.data)) {
      return;
    }

    if (location.pathname === '/onboarding') {
      return;
    }

    void navigate({ to: '/onboarding', replace: true });
  }, [dbStatus, location.pathname, navigate, onboardingQuery.data]);

  return children;
}
