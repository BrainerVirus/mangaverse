import { useSyncExternalStore } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  notify,
  useStateReducer,
} from '@app/design-system';

import { actionFailureMessage } from '../lib/app-feedback.js';
import {
  exportOldRendererData,
  getRendererImportState,
  resetRendererImportState,
  subscribeRendererImport,
} from '../lib/renderer-data-import.js';
import { useLocalDbRetry } from '../providers/local-db-provider.js';

/**
 * Surfaces the one-way move of an existing profile (#213). A failed import leaves the old
 * data in place and the app usable; Retry is user-initiated, and Export hands over the old
 * snapshot and blob inventory while the import is still failing.
 */
export function RendererImportBanner() {
  const state = useSyncExternalStore(
    subscribeRendererImport,
    getRendererImportState,
    getRendererImportState,
  );
  const retry = useLocalDbRetry();
  const [exporting, setExporting] = useStateReducer(
    (_state: boolean, event: 'start' | 'stop') => event === 'start',
    false,
  );

  if (state.phase !== 'failed') {
    return null;
  }

  const handleRetry = () => {
    resetRendererImportState();
    retry();
  };

  const handleExport = () => {
    setExporting('start');
    void exportOldRendererData()
      .then((result) => {
        if (!result.ok) {
          notify.failure({
            key: 'renderer-import.export',
            message: actionFailureMessage(result.error, 'The old data could not be exported.'),
          });
          return;
        }
        if (result.value !== undefined) {
          notify.success('Exported the old local data.');
        }
      })
      .catch((error: unknown) => {
        notify.failure({
          key: 'renderer-import.export',
          message: actionFailureMessage(error, 'The old data could not be exported.'),
        });
      })
      .finally(() => setExporting('stop'));
  };

  return (
    <div className="px-3 pt-3">
      <Alert variant="destructive" role="alert" className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <AlertTitle>Could not import your existing data</AlertTitle>
            <AlertDescription>
              Your old data is untouched and the app is still usable. {state.errorMessage}
            </AlertDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exporting…' : 'Export old data'}
            </Button>
            <Button size="sm" onClick={handleRetry}>
              Retry import
            </Button>
          </div>
        </div>
      </Alert>
    </div>
  );
}
