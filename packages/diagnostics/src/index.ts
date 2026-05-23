export { APP_NAME, APP_VERSION } from './constants.js';
export { createAppPlatformAdapter } from './create-app-platform-adapter.js';
export { DiagnosticsPage, type DiagnosticsPageProps } from './components/DiagnosticsPage.js';
export { fetchDiagnosticsReport, type FetchDiagnosticsReportInput } from './fetch-diagnostics-report.js';
export { fetchLocalDataSummary } from './fetch-local-data-summary.js';
export {
  formatDiagnosticsReport,
  formatStorageBytes,
} from './format-diagnostics-report.js';
export { diagnosticsQueryKeys } from './query-keys.js';
export type { DiagnosticsReport, LocalDataSummary } from './types.js';

export const PACKAGE_NAME = '@app/diagnostics' as const;
