import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomeRoute,
});

function HomeRoute() {
  return <Navigate to="/discover" />;
}
