import type { RestorePreviewReport } from '@app/db';

export interface RestorePreviewSummary {
  readonly canRestore: boolean;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
}

export function summarizeRestorePreview(report: RestorePreviewReport): RestorePreviewSummary {
  const errorCount =
    report.backupIssues.length +
    report.previewIssues.filter((issue) => issue.severity === 'error').length;
  const warningCount = report.previewIssues.filter((issue) => issue.severity === 'warning').length;
  const infoCount = report.previewIssues.filter((issue) => issue.severity === 'info').length;

  return {
    canRestore: report.backupOk && errorCount === 0,
    errorCount,
    warningCount,
    infoCount,
  };
}
