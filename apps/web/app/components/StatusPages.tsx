import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { buttonSizes, buttonVariants, cn, ErrorState } from '@app/design-system';

import { failureMessage } from '../lib/app-feedback.js';

function BackToLibrary() {
  return (
    <Link to="/library" className={cn(buttonVariants.outline, buttonSizes.default)}>
      Back to library
    </Link>
  );
}

/** Nothing useful can render on this route. The thrown text only reaches the log. */
export function RouteErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <section aria-label="Something went wrong" className="flex flex-col items-center pb-12">
      <ErrorState
        title="Something went wrong"
        message={failureMessage(error, 'This page could not be shown. Try again.')}
        onRetry={() => {
          reset();
          void router.invalidate();
        }}
      />
      <BackToLibrary />
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section
      aria-label="Page not found"
      className="flex flex-col items-center gap-2 p-8 text-center"
    >
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Page not found</h1>
      <p className="mb-4 max-w-sm text-sm text-muted-foreground">
        This address doesn&apos;t lead anywhere in MangaVerse.
      </p>
      <BackToLibrary />
    </section>
  );
}
