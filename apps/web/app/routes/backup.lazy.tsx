import { createLazyFileRoute } from '@tanstack/react-router';
import { EmptyState } from '@app/design-system';

export const Route = createLazyFileRoute('/backup')({
  component: BackupRoute,
});

function BackupRoute() {
  return (
    <main className="app-shell">
      <EmptyState
        type="no-backups"
        action={{
          label: 'Create Backup',
          onClick: () => {},
        }}
      />
    </main>
  );
}
