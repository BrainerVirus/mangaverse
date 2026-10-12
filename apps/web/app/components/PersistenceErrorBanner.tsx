import { Alert, AlertDescription, AlertTitle, Button } from '@app/design-system';

import { usePersistenceError, useRetryPersistence } from '../providers/local-db-provider.js';

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
