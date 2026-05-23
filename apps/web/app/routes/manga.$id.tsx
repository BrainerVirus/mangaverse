import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/manga/$id')({
  component: MangaDetailRoute,
});

function MangaDetailRoute() {
  const { id } = Route.useParams();
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Manga: {id}</h1>
    </main>
  );
}