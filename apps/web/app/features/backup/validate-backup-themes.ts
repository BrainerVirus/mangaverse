import type { BackupValidationIssue } from '@app/shared';
import { validateThemeDefinition } from '@/features/theme';

/**
 * `@app/shared` cannot import `@/features/theme` (theme depends on shared), so the
 * backup schema validates only the theme shape. Color syntax needs culori, and
 * this import/restore boundary is the layer that owns both packages: it rejects
 * `not-a-color` seeds and `url(...)` overrides before a backup is persisted.
 */
export function validateBackupThemeColors(input: unknown): readonly BackupValidationIssue[] {
  if (typeof input !== 'object' || input === null) {
    return [];
  }
  const themes = (input as { readonly themes?: unknown }).themes;
  if (!Array.isArray(themes)) {
    return [];
  }

  return themes.flatMap((theme, index) => {
    const result = validateThemeDefinition(theme);
    if (result.ok) {
      return [];
    }
    return result.issues.map((issue) => {
      const path = issue.path === '' ? `themes.${index}` : `themes.${index}.${issue.path}`;
      return {
        path,
        code: 'backup.invalid',
        message: `${path}: ${issue.message}`,
      };
    });
  });
}
