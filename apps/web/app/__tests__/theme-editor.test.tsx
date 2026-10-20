import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { buildThemeCssVariables, getBuiltInThemeDefinition, ThemeEditorPage } from '@app/theme';
import type { ThemeDefinition } from '@app/shared';

const draft: ThemeDefinition = {
  ...getBuiltInThemeDefinition('warm-paper'),
  id: 'custom:warm',
  name: 'Warm Draft',
  basedOn: 'warm-paper',
};

function renderEditor(overrides: Partial<Parameters<typeof ThemeEditorPage>[0]> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const callbacks = {
    onChange: vi.fn<(next: ThemeDefinition) => void>(),
    onSave: vi.fn<() => void>(),
    onDelete: vi.fn<() => void>(),
    onDuplicate: vi.fn<() => void>(),
    onCancel: vi.fn<() => void>(),
  };

  act(() => {
    root.render(<ThemeEditorPage draft={draft} isSaved {...callbacks} {...overrides} />);
  });

  return {
    container,
    ...callbacks,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function buttonByText(scope: ParentNode, label: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

describe('theme editor', () => {
  it('keeps sections flat: no card is nested inside the editor', () => {
    const { container, cleanup } = renderEditor();

    // Cards are content, not layout: the shell uses headings + spacing, and the
    // only bordered fill is the sample card inside each preview.
    expect(container.querySelectorAll('.rounded-box.border')).toHaveLength(0);
    const panes = container.querySelectorAll('figure[data-appearance]');
    expect(panes).toHaveLength(2);
    for (const pane of panes) {
      expect(pane.querySelectorAll('.border')).toHaveLength(1);
    }

    cleanup();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('style');
  });

  it('Given a draft, Then light and dark previews paint the same scoped variables as apply', () => {
    const editor = renderEditor();

    const light = editor.container.querySelector<HTMLElement>('[aria-label="Light preview"]');
    const dark = editor.container.querySelector<HTMLElement>('[aria-label="Dark preview"]');
    expect(light).not.toBeNull();
    expect(dark).not.toBeNull();

    for (const [element, isDark] of [
      [light, false],
      [dark, true],
    ] as const) {
      const variables = buildThemeCssVariables({ themeId: draft.id, dark: isDark }, draft);
      for (const key of ['--background', '--foreground', '--primary', '--muted-foreground']) {
        expect(element?.style.getPropertyValue(key), `${key} (${isDark ? 'dark' : 'light'})`).toBe(
          variables[key],
        );
      }
    }

    // Nothing may reach the document root before Save.
    expect(document.documentElement.getAttribute('style')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--background')).toBe('');

    editor.cleanup();
  });

  it('Given the name field, When it changes, Then the draft is updated through the route', () => {
    const editor = renderEditor();
    const input = editor.container.querySelector<HTMLInputElement>('#theme-name');
    expect(input?.value).toBe('Warm Draft');

    act(() => {
      if (input === null) return;
      // oxlint-disable-next-line typescript/unbound-method -- the native setter bypasses React's value tracker so the input event reaches onChange; Reflect.apply binds it to the element.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter !== undefined) {
        Reflect.apply(setter, input, ['Renamed Theme']);
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(editor.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Renamed Theme' }),
    );

    editor.cleanup();
  });

  it('Given the shell actions, Then save, duplicate and cancel reach their handlers', () => {
    const editor = renderEditor();

    act(() => {
      buttonByText(editor.container, 'Save theme').click();
      buttonByText(editor.container, 'Duplicate').click();
      buttonByText(editor.container, 'Cancel').click();
    });

    expect(editor.onSave).toHaveBeenCalledTimes(1);
    expect(editor.onDuplicate).toHaveBeenCalledTimes(1);
    expect(editor.onCancel).toHaveBeenCalledTimes(1);

    editor.cleanup();
  });

  it('Given a saved draft, When Delete is confirmed, Then the route deletes it', () => {
    const editor = renderEditor();

    act(() => {
      buttonByText(editor.container, 'Delete theme').click();
    });
    expect(document.body.textContent).toContain('Delete “Warm Draft”?');

    act(() => {
      const confirm = [...document.body.querySelectorAll('button')].filter(
        (candidate) => candidate.textContent?.trim() === 'Delete theme',
      );
      confirm.at(-1)?.click();
    });

    expect(editor.onDelete).toHaveBeenCalledTimes(1);

    editor.cleanup();
  });

  it('Given the editor, Then Guided is the default tab and Advanced renders its own panel', async () => {
    const editor = renderEditor();

    const tabs = [...editor.container.querySelectorAll('[role="tab"]')].map((tab) =>
      tab.textContent?.trim(),
    );
    expect(tabs).toEqual(['Guided', 'Advanced']);
    expect(editor.container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
      'Guided',
    );
    expect(editor.container.querySelector('[data-testid="theme-guided-editor"]')).not.toBeNull();
    expect(editor.container.querySelector('[data-testid="theme-advanced-editor"]')).toBeNull();

    // The panel is React.lazy: the click suspends until its chunk resolves.
    await act(async () => {
      buttonByText(editor.container, 'Advanced').click();
    });
    await vi.waitFor(() => {
      expect(
        editor.container.querySelector('[data-testid="theme-advanced-editor"]'),
      ).not.toBeNull();
    });

    expect(editor.container.querySelector('[data-testid="theme-guided-editor"]')).toBeNull();

    editor.cleanup();
  });

  it('Then the duplicate and delete actions name the draft theme', () => {
    const editor = renderEditor();

    expect(
      editor.container.querySelector('button[aria-label="Duplicate Warm Draft"]'),
    ).not.toBeNull();
    expect(editor.container.querySelector('button[aria-label="Delete Warm Draft"]')).not.toBeNull();

    editor.cleanup();
  });

  it('Given an unsaved draft, Then there is no delete affordance', () => {
    const editor = renderEditor({ isSaved: false });

    expect(
      [...editor.container.querySelectorAll('button')].some(
        (candidate) => candidate.textContent?.trim() === 'Delete theme',
      ),
    ).toBe(false);

    editor.cleanup();
  });

  it('Given validation issues, Then they are listed with their token paths', () => {
    const editor = renderEditor({
      issues: [
        { path: 'light.overrides.--glass-stage', message: 'Unrecognized key: --glass-stage' },
        { path: 'name', message: 'Theme name is required.' },
      ],
      errorMessage: null,
    });

    expect(editor.container.textContent).toContain('Check the theme before saving');
    expect(editor.container.textContent).toContain(
      'light.overrides.--glass-stage: Unrecognized key: --glass-stage',
    );
    expect(editor.container.textContent).toContain('name: Theme name is required.');

    editor.cleanup();
  });

  it('Given a rejected save, Then the error message is visible', () => {
    const editor = renderEditor({ errorMessage: 'Theme.invalid: name is required' });

    expect(editor.container.textContent).toContain('Could not save the theme');
    expect(editor.container.textContent).toContain('Theme.invalid: name is required');

    editor.cleanup();
  });
});
