import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/app')({
  component: SettingsAppRoute,
});

function SettingsAppRoute() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">App Settings</h1>
    </main>
  );
}