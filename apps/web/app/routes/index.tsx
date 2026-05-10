import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomeRoute,
});

function HomeRoute() {
  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Phase 1.1</p>
        <h1>MangaVerse</h1>
        <p>TanStack Start monorepo foundation is online.</p>
      </section>
    </main>
  );
}
