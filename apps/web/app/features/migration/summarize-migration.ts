import type { MigrationApplyReport, MigrationPreviewReport } from '@app/db';

import type {
  MigrationApplyReportView,
  MigrationApplySummary,
  MigrationRollbackSummary,
} from './types.js';

export function summarizeMigrationPreview(preview: MigrationPreviewReport): MigrationApplySummary {
  const blockedCount = preview.items.filter((item) => item.blocked).length;
  const readyCount = preview.items.length - blockedCount;
  return {
    appliedCount: readyCount,
    skippedCount: blockedCount,
    canApply: preview.canApply && readyCount > 0,
  };
}

/** Per-title apply report; skipped entries carry the reason the DB reported. */
export function buildMigrationApplyReport(
  report: MigrationApplyReport,
  titles: Readonly<Record<string, string>>,
): MigrationApplyReportView {
  return {
    appliedCount: report.applied.length,
    skippedCount: report.skipped.length,
    items: [
      ...report.applied.map((item) => ({
        mangaId: item.mangaId,
        title: titles[item.mangaId] ?? item.mangaId,
        status: 'applied' as const,
      })),
      ...report.skipped.map((item) => ({
        mangaId: item.mangaId,
        title: titles[item.mangaId] ?? item.mangaId,
        status: 'skipped' as const,
        ...(item.error !== undefined ? { reason: item.error } : {}),
      })),
    ],
  };
}

export function summarizeMigrationRollback(
  report: MigrationRollbackReportLike,
  titles: Readonly<Record<string, string>>,
): MigrationRollbackSummary {
  return {
    restoredCount: report.restored.length,
    alreadyRestoredCount: report.alreadyRestored?.length ?? 0,
    skippedCount: report.skipped.length,
    skipped: report.skipped.map((item) => ({
      mangaId: item.mangaId,
      title: titles[item.mangaId] ?? item.mangaId,
      reason: item.error ?? 'Not restored.',
    })),
  };
}

interface MigrationRollbackReportLike {
  readonly restored: readonly { readonly mangaId: string }[];
  readonly alreadyRestored?: readonly { readonly mangaId: string }[];
  readonly skipped: readonly { readonly mangaId: string; readonly error?: string }[];
}
