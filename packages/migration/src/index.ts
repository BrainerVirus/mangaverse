export { applyMigration, type MigrationApplyReport } from './apply-migration.js';
export { MigrationPage, type MigrationPageProps } from './components/MigrationPage.js';
export { fetchMigrationCandidates, fetchMigrationProviders } from './fetch-migration-page.js';
export { previewMigration } from './preview-migration.js';
export { migrationQueryKeys } from './query-keys.js';
export {
  rankMigrationSearchResults,
  scoreMigrationMatch,
} from './score-migration-match.js';
export { summarizeMigrationApply, summarizeMigrationPreview } from './summarize-migration.js';
export type {
  MigrationApplySummary,
  MigrationCandidate,
  MigrationProviderOption,
  MigrationSearchCandidate,
  MigrationSearchResult,
  MigrationSelectionDraft,
} from './types.js';

export const PACKAGE_NAME = '@app/migration' as const;
