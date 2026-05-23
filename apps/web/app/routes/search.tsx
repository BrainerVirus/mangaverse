import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/search')({
  component: SearchRoute,
});

function SearchRoute() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Search</h1>
    </main>
  );
}