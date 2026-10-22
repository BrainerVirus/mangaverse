import { createLazyFileRoute, useNavigate } from '@tanstack/react-router';
import { MigrationPage } from '@app/migration';

import { useMigrationController } from '../queries/use-migration-controller.js';

export const Route = createLazyFileRoute('/migration')({
  component: MigrationRoute,
});

function MigrationRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  return (
    <MigrationPage
      {...useMigrationController(search)}
      onClearHandoff={() => void navigate({ to: '/migration', search: {}, replace: true })}
    />
  );
}
