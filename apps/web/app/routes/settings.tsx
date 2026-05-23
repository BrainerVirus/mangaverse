import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
});

function SettingsRoute() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
    </main>
  );
}