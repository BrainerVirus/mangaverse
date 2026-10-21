import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  // Redirect before any HTML renders: a client <Navigate> shipped the landing
  // document, hydrated it, then transitioned to /discover.
  beforeLoad: () => {
    throw redirect({ to: '/discover' });
  },
});
