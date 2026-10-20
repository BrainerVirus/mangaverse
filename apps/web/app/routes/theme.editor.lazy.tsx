import { useState } from 'react';
import { createLazyFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createCustomThemeId,
  deleteThemeDefinition,
  saveThemeDefinition,
  themeQueryKeys,
  ThemeEditorPage,
  validateThemeDefinition,
} from '@app/theme';
import { ErrorState, LoadingState } from '@app/design-system';
import type { AppDrizzleDb } from '@app/db';
import type { ThemeDefinition, ThemeDefinitionIssue, ThemeSettings } from '@app/shared';

import { createThemeEditorDraft } from '../components/theme/theme-editor-draft.js';
import { themeSettingsAfterDelete } from '../components/theme/theme-selection.js';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';
import { useTheme } from '../providers/theme-provider.js';

export const Route = createLazyFileRoute('/theme/editor')({
  component: ThemeEditorRoute,
});

function ThemeEditorRoute() {
  const dbStatus = useLocalDbStatus();
  const db = useLocalDb();
  const { settings, customThemes, isLoadingCustomThemes } = useTheme();

  if (dbStatus === 'loading' || isLoadingCustomThemes) {
    return (
      <section aria-label="Theme editor" className="mx-auto w-full max-w-5xl p-6">
        <LoadingState type="detail" />
      </section>
    );
  }

  if (dbStatus === 'error' || db === null) {
    return (
      <section aria-label="Theme editor" className="mx-auto w-full max-w-5xl p-6">
        <ErrorState
          title="Could not open the theme editor"
          message="Your local database may be unavailable. Try reloading the page."
        />
      </section>
    );
  }

  return <ThemeEditorForm db={db} settings={settings} customThemes={customThemes} />;
}

function ThemeEditorForm({
  db,
  settings,
  customThemes,
}: {
  db: AppDrizzleDb;
  settings: ThemeSettings;
  customThemes: readonly ThemeDefinition[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setThemeSettings, hydrateThemeDefinitions } = useTheme();
  const [draft, setDraft] = useState<ThemeDefinition>(
    () => createThemeEditorDraft(settings, customThemes).definition,
  );
  const [issues, setIssues] = useState<readonly ThemeDefinitionIssue[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSaved = customThemes.some((definition) => definition.id === draft.id);

  const saveMutation = useMutation({
    mutationFn: async (definition: ThemeDefinition): Promise<ThemeDefinition> => {
      const result = await saveThemeDefinition(db, definition);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.value;
    },
    onSuccess: async (saved) => {
      setIssues([]);
      setErrorMessage(null);
      // Hydrate first: the refetch below is async and the new id must not flash the
      // missing-theme fallback while the themes table catches up.
      hydrateThemeDefinitions([
        ...customThemes.filter((definition) => definition.id !== saved.id),
        saved,
      ]);
      setThemeSettings({ ...settings, themeId: saved.id });
      await queryClient.invalidateQueries({ queryKey: themeQueryKeys.definitions() });
    },
    onError: (error) => {
      setErrorMessage(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (themeId: string): Promise<string> => {
      const result = await deleteThemeDefinition(db, themeId);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return themeId;
    },
    onSuccess: async (themeId) => {
      setThemeSettings(themeSettingsAfterDelete(settings, themeId));
      await queryClient.invalidateQueries({ queryKey: themeQueryKeys.definitions() });
      void navigate({ to: '/theme' });
    },
    onError: (error) => {
      setErrorMessage(error.message);
    },
  });

  const handleSave = () => {
    const validation = validateThemeDefinition(draft);
    if (!validation.ok) {
      setIssues(validation.issues);
      setErrorMessage(null);
      return;
    }
    saveMutation.mutate(validation.value);
  };

  const handleDuplicate = () => {
    setIssues([]);
    setErrorMessage(null);
    setDraft({
      ...draft,
      id: createCustomThemeId(globalThis.crypto.randomUUID()),
      name: `${draft.name} copy`,
    });
  };

  return (
    <ThemeEditorPage
      draft={draft}
      isSaved={isSaved}
      isSaving={saveMutation.isPending}
      isDeleting={deleteMutation.isPending}
      issues={issues}
      errorMessage={errorMessage}
      onChange={setDraft}
      onSave={handleSave}
      onDuplicate={handleDuplicate}
      onDelete={() => deleteMutation.mutate(draft.id)}
      onCancel={() => {
        void navigate({ to: '/theme' });
      }}
    />
  );
}
