import { createFileRoute, redirect } from '@tanstack/react-router';

/** Old URL, kept for bookmarks and links. */
export const Route = createFileRoute('/theme/editor')({
  beforeLoad: () => {
    throw redirect({ to: '/advanced/theme', replace: true });
  },
});
