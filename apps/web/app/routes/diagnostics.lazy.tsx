import { createLazyFileRoute } from '@tanstack/react-router';
import { EmptyState } from '@app/design-system';

export const Route = createLazyFileRoute('/diagnostics')({
  component: DiagnosticsRoute,
});

function DiagnosticsRoute() {
  return (
    <main className="app-shell">
      <EmptyState
        type="no-provider"
        action={{
          label: 'Run Diagnostics',
          onClick: () => {},
        }}
      />
    </main>
  );
}
