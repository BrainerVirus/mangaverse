import { describe, expect, it } from 'vitest';
import { getBuiltInThemeDefinition } from '@app/theme';
import type { ThemeDefinition } from '@app/shared';
import { createThemeEditorDraft } from '../components/theme/theme-editor-draft.js';

const saved: ThemeDefinition = {
  ...getBuiltInThemeDefinition('sakura'),
  id: 'custom:saved',
  name: 'Saved Theme',
  basedOn: 'sakura',
};

describe('theme editor draft', () => {
  it('Given the selected custom theme exists, Then the editor edits it', () => {
    const draft = createThemeEditorDraft({ themeId: saved.id, dark: true }, [saved]);

    expect(draft.isSaved).toBe(true);
    expect(draft.definition).toEqual(saved);
  });

  it('Given a built-in selection, Then a fresh custom draft is created from it', () => {
    const draft = createThemeEditorDraft({ themeId: 'sakura', dark: false }, []);

    expect(draft.isSaved).toBe(false);
    expect(draft.definition.id).toMatch(/^custom:/);
    expect(draft.definition.name).toBe('Sakura copy');
    expect(draft.definition.basedOn).toBe('sakura');
    expect(draft.definition.light).toEqual(getBuiltInThemeDefinition('sakura').light);
  });

  it('Given a missing custom theme, Then the draft starts from the default theme', () => {
    const draft = createThemeEditorDraft({ themeId: 'custom:gone', dark: false }, []);

    expect(draft.isSaved).toBe(false);
    expect(draft.definition.basedOn).toBe('default');
    expect(draft.definition.light).toEqual(getBuiltInThemeDefinition('default').light);
  });
});
