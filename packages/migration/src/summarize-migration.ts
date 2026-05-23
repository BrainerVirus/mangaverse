import type { MigrationPreviewReport } from '@app/db';

import type { MigrationApplySummary } from './types.js';

export function summarizeMigrationPreview(preview: MigrationPreviewReport): MigrationApplySummary {
  const blockedCount = preview.items.filter((item) => item.blocked).length;
  const readyCount = preview.items.length - blockedCount;
  return {
    appliedCount: readyCount,
    skippedCount: blockedCount,
    canApply: preview.canApply && readyCount > 0,
  };
}

export function summarizeMigrationApply(report: MigrationApplyReportLike): MigrationApplySummary {
  return {
    appliedCount: report.applied.length,
    skippedCount: report.skipped.length,
    canApply: report.applied.length > 0,
  };
}

interface MigrationApplyReportLike {
  readonly applied: readonly unknown[];
  readonly skipped: readonly unknown[];
}
