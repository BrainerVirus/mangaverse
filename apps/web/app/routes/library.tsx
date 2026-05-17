import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/library')({
  component: LibraryRoute,
});

function LibraryRoute() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Library</h1>
    </main>
  );
}