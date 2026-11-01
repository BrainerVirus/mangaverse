import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { MigrationPage } from '@/features/migration/index.js';

import { migrationSearchSchema, type MigrationSearch } from '../lib/migration-search.js';
import { useMigrationController } from '../queries/use-migration-controller.js';

export const Route = createFileRoute('/advanced/migration')({
  validateSearch: (search: Record<string, unknown>): MigrationSearch =>
    migrationSearchSchema.parse(search),
  component: MigrationRoute,
});

function MigrationRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  return (
    <MigrationPage
      {...useMigrationController(search)}
      onClearHandoff={() => void navigate({ to: '/advanced/migration', search: {}, replace: true })}
    />
  );
}
