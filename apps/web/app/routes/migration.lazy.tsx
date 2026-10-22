import { createLazyFileRoute } from '@tanstack/react-router';
import { MigrationPage } from '@app/migration';

import { useMigrationController } from '../queries/use-migration-controller.js';

export const Route = createLazyFileRoute('/migration')({
  component: MigrationRoute,
});

function MigrationRoute() {
  return <MigrationPage {...useMigrationController()} />;
}
