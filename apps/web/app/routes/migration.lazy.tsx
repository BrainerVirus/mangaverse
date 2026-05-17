import { createLazyFileRoute } from '@tanstack/react-router';
import { EmptyState } from '@app/design-system';

export const Route = createLazyFileRoute('/migration')({
  component: MigrationRoute,
});

function MigrationRoute() {
  return (
    <main className="app-shell">
      <EmptyState
        type="no-provider"
        action={{
          label: 'Start Migration',
          onClick: () => {},
        }}
      />
    </main>
  );
}
