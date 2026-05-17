import { createLazyFileRoute } from '@tanstack/react-router';
import { EmptyState } from '@app/design-system';

export const Route = createLazyFileRoute('/theme')({
  component: ThemeRoute,
});

function ThemeRoute() {
  return (
    <main className="app-shell">
      <EmptyState
        type="no-provider"
        action={{
          label: 'Customize Theme',
          onClick: () => {},
        }}
      />
    </main>
  );
}
