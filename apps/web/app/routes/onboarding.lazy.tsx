import { createLazyFileRoute } from '@tanstack/react-router';
import { EmptyState } from '@app/design-system';

export const Route = createLazyFileRoute('/onboarding')({
  component: OnboardingRoute,
});

function OnboardingRoute() {
  return (
    <main className="app-shell">
      <EmptyState
        type="no-provider"
        action={{
          label: 'Get Started',
          onClick: () => {},
        }}
      />
    </main>
  );
}
