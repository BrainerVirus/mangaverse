import { createLazyFileRoute } from '@tanstack/react-router';
import { EmptyState } from '@app/design-system';

export const Route = createLazyFileRoute('/extensions/$providerId')({
  component: ProviderDetailRoute,
});

function ProviderDetailRoute() {
  return (
    <main className="app-shell">
      <EmptyState
        type="no-provider"
        action={{
          label: 'Configure Provider',
          onClick: () => {},
        }}
      />
    </main>
  );
}
