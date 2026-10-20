import { Alert, AlertDescription, AlertTitle, Button } from '@app/design-system';

import {
  useLocalDbError,
  useLocalDbRetry,
  useLocalDbStatus,
  usePersistenceError,
  useRetryPersistence,
} from '../providers/local-db-provider.js';

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
    <div className="p-3">
      <Alert variant="destructive" role="alert">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <AlertTitle>Saving locally failed</AlertTitle>
            <AlertDescription>
              Recent changes are not stored on this device yet: {message}
            </AlertDescription>
          </div>
          <Button size="sm" variant="outline" onClick={retry}>
            Retry
          </Button>
        </div>
      </Alert>
    </div>
  );
}

/**
 * Surfaces a failure to open the local database. Mounted once in
 * `ShellProviders` so the app shell and the reader share one banner; the
 * reader layout is `fixed`, hence the overlay positioning.
 */
export function LocalDbErrorBanner() {
  const status = useLocalDbStatus();
  const message = useLocalDbError();
  const retry = useLocalDbRetry();

  if (status !== 'error' || message === null) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 top-0 z-50 p-3">
      <Alert variant="destructive" role="alert" className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <AlertTitle>Could not open the local library</AlertTitle>
            <AlertDescription>Reading and saving are unavailable: {message}</AlertDescription>
          </div>
          <Button size="sm" variant="outline" onClick={retry}>
            Reopen database
          </Button>
        </div>
      </Alert>
    </div>
  );
}
