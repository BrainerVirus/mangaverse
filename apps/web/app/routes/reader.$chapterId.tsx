import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/reader/$chapterId')({
  component: ReaderRoute,
});

function ReaderRoute() {
  const { chapterId } = Route.useParams();
  return (
    <main>
      <h1 className="text-2xl font-bold">Reader: {chapterId}</h1>
    </main>
  );
}