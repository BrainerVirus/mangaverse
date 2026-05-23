import { createLazyFileRoute } from '@tanstack/react-router';
import { EmptyState } from '@app/design-system';

export const Route = createLazyFileRoute('/extensions')({
  component: ExtensionsRoute,
});

function ExtensionsRoute() {
  return (
    <main className="app-shell">
      <EmptyState
        type="no-provider"
        action={{
          label: 'Install Provider',
          onClick: () => {},
        }}
      />
    </main>
  );
}
