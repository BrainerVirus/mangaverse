import type { AppDrizzleDb } from '@app/db';
import type { PlatformAdapter, PlatformCapabilities } from '@app/platform';

import { APP_NAME, APP_VERSION } from './constants.js';
import { fetchLocalDataSummary } from './fetch-local-data-summary.js';
import type { DiagnosticsReport } from './types.js';

export interface FetchDiagnosticsReportInput {
  readonly adapter: PlatformAdapter;
  readonly capabilities: PlatformCapabilities;
  readonly db: AppDrizzleDb | null;
}

export async function fetchDiagnosticsReport(input: FetchDiagnosticsReportInput): Promise<DiagnosticsReport> {
  const { adapter, capabilities, db } = input;

  const [snapshotResult, storageResult, localServiceResult, localData] = await Promise.all([
    adapter.diagnostics.getSnapshot(),
    capabilities.storageEstimate ? adapter.storage.estimate() : Promise.resolve(null),
    capabilities.localService ? adapter.localService.getInfo() : Promise.resolve(null),
    db !== null ? fetchLocalDataSummary(db) : Promise.resolve(null),
  ]);

  const platformSnapshot = snapshotResult.ok ? snapshotResult.value : {};
  const storageEstimate =
    storageResult !== null && storageResult.ok ? storageResult.value : null;
  const localService =
    localServiceResult !== null && localServiceResult.ok ? localServiceResult.value : null;

  return {
    generatedAt: new Date().toISOString(),
    appName: APP_NAME,
    appVersion: platformSnapshot.appVersion ?? APP_VERSION,
    runtime: capabilities.runtime,
    capabilities,
    platformSnapshot: {
      ...platformSnapshot,
      appVersion: platformSnapshot.appVersion ?? APP_VERSION,
    },
    storageEstimate,
    localService,
    localData,
    localDatabaseReady: db !== null,
  };
}
