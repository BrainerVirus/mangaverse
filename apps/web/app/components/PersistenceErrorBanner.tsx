import { Alert, AlertDescription, AlertTitle, Button } from '@app/design-system';

import {
  useLocalDbError,
  useLocalDbRetry,
  useLocalDbStatus,
  usePersistenceError,
  useRetryPersistence,
} from '../providers/local-db-provider.js';

interface ErrorBannerProps {
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly onRetry: () => void;
}

/** Both storage failures read the same: a destructive notice with one retry. */
function ErrorBanner({ title, description, actionLabel, onRetry }: ErrorBannerProps) {
  return (
    <div className="px-3 pt-3">
      <Alert variant="destructive" role="alert" className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>{description}</AlertDescription>
          </div>
          <Button size="sm" variant="outline" onClick={onRetry}>
            {actionLabel}
          </Button>
        </div>
      </Alert>
    </div>
  );
}

/**
 * Surfaces durable-write failures (quota, denied storage) with a retry so the
 * app never reports a save as durable when it is not.
 */
export function PersistenceErrorBanner() {
  const message = usePersistenceError();
  const retry = useRetryPersistence();

  if (message === null) {
    return null;
  }

  return (
    <ErrorBanner
      title="Saving locally failed"
      description={`Recent changes are not stored on this device yet: ${message}`}
      actionLabel="Retry"
      onRetry={retry}
    />
  );
}

/**
 * Surfaces a failure to open the local database. Mounted once per layout in
 * `AppNotices`, above the outlet, so it takes layout space instead of covering
 * the page header.
 */
export function LocalDbErrorBanner() {
  const status = useLocalDbStatus();
  const message = useLocalDbError();
  const retry = useLocalDbRetry();

  if (status !== 'error' || message === null) {
    return null;
  }

  return (
    <ErrorBanner
      title="Could not open the local library"
      description={`Reading and saving are unavailable: ${message}`}
      actionLabel="Reopen database"
      onRetry={retry}
    />
  );
}
