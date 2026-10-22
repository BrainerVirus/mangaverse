import { createLazyFileRoute, useLocation } from '@tanstack/react-router';
import { MigrationPage } from '@app/migration';

import { useMigrationController } from '../queries/use-migration-controller.js';

export const Route = createLazyFileRoute('/migration')({
  component: MigrationRoute,
});

function MigrationRoute() {
  // Lazy routes cannot declare a search schema, so the source prefill reads the
  // raw search object once; the title itself pre-fills from the canonical title.
  const search = useLocation({ select: (location) => location.search }) as {
    readonly source?: unknown;
  };
  const source = typeof search.source === 'string' ? search.source.trim() : '';
  return (
    <MigrationPage
      {...useMigrationController({ initialSourceProviderId: source.length > 0 ? source : null })}
    />
  );
}
