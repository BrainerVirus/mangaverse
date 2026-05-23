import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/reader')({
  component: SettingsReaderRoute,
});

function SettingsReaderRoute() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Reader Settings</h1>
    </main>
  );
}