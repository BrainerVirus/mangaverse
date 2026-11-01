import { createFileRoute, redirect } from '@tanstack/react-router';

/** Old URL, kept for bookmarks and links. */
export const Route = createFileRoute('/diagnostics')({
  beforeLoad: () => {
    throw redirect({ to: '/advanced/diagnostics', replace: true });
  },
});
