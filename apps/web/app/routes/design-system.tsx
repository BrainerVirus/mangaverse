import { createFileRoute } from '@tanstack/react-router';
import { DesignSystemPage } from '../components/design-system/DesignSystemPage.js';

export const Route = createFileRoute('/design-system')({
  component: DesignSystemRoute,
});

function DesignSystemRoute() {
  return <DesignSystemPage />;
}
