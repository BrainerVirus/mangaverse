/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ThemeDefinition } from '@app/shared';

import { presetToThemeDefinition } from '../../built-in-themes.js';
import { getThemePreset } from '../../presets.js';
import { ThemeAdvancedEditor } from '../ThemeAdvancedEditor.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function customDefinition(): ThemeDefinition {
  return {
    ...presetToThemeDefinition(getThemePreset('default')),
    id: 'custom:demo',
    name: 'Custom Demo',
    basedOn: 'default',
  };
}

function renderAdvanced(draft: ThemeDefinition = customDefinition(), disabled = false) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onChange = vi.fn<(next: ThemeDefinition) => void>();

  act(() => {
    root.render(<ThemeAdvancedEditor draft={draft} onChange={onChange} disabled={disabled} />);
  });

  return {
    container,
    onChange,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function buttonByText(scope: ParentNode, label: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll('button')].find(
    (candidate) => candidate.textContent.trim() === label,
  );
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

function typeInto(input: HTMLInputElement, value: string): void {
  // oxlint-disable-next-line typescript/unbound-method -- the native setter bypasses React's value tracker so the input event reaches onChange; Reflect.apply binds it to the element.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter !== undefined) {
    Reflect.apply(setter, input, [value]);
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ThemeAdvancedEditor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('Given the tokens view, Then the five groups are rendered for both appearances', () => {
    const editor = renderAdvanced();
    const text = editor.container.textContent;

    for (const label of ['Surfaces', 'Text', 'Borders', 'Status', 'Reader']) {
      expect(text).toContain(label);
    }
    expect(editor.container.querySelector('#theme-override-light---ring')).not.toBeNull();
    expect(editor.container.querySelector('#theme-override-dark---ring')).toBeNull();

    act(() => {
      buttonByText(editor.container, 'Dark').click();
    });

    expect(editor.container.querySelector('#theme-override-dark---ring')).not.toBeNull();
    expect(editor.container.querySelector('#theme-override-light---ring')).toBeNull();

    editor.cleanup();
  });

  it('Given an allow-listed token, When edited, Then the draft update carries the override', () => {
    const draft = customDefinition();
    const editor = renderAdvanced(draft);
    const input = editor.container.querySelector<HTMLInputElement>('#theme-override-light---ring');
    expect(input).not.toBeNull();

    act(() => {
      if (input !== null) {
        typeInto(input, 'oklch(0.62 0.18 70)');
      }
    });

    expect(editor.onChange).toHaveBeenCalledTimes(1);
    const next = editor.onChange.mock.calls[0]?.[0];
    expect(next?.light.overrides?.['--ring']).toBe('oklch(0.62 0.18 70)');
    expect(draft.light.overrides?.['--ring']).toBeUndefined();

    editor.cleanup();
  });

  it('Given an invalid color in the draft, Then the hint names CSS Color 4 and the field stays editable', () => {
    const draft = customDefinition();
    const invalid: ThemeDefinition = {
      ...draft,
      light: { ...draft.light, overrides: { ...draft.light.overrides, '--ring': 'not-a-color' } },
    };
    const editor = renderAdvanced(invalid);
    const input = editor.container.querySelector<HTMLInputElement>('#theme-override-light---ring');

    expect(input?.value).toBe('not-a-color');
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    expect(editor.container.textContent).toContain('Must be a CSS Color 4 value');

    act(() => {
      if (input !== null) {
        typeInto(input, 'oklch(0.62 0.18 70)');
      }
    });

    expect(editor.onChange).toHaveBeenCalledTimes(1);

    editor.cleanup();
  });

  it('Given glass and radius tokens, Then they are read-only and cannot be overridden', () => {
    const editor = renderAdvanced();
    const fixed = editor.container.querySelector('[data-testid="theme-fixed-tokens"]');

    expect(fixed).not.toBeNull();
    expect(fixed?.querySelectorAll('input')).toHaveLength(0);
    expect(fixed?.textContent).toContain('--glass-stage');
    expect(fixed?.textContent).toContain('--glass-sheen');
    expect(fixed?.textContent).toContain('--glass-inner');
    expect(fixed?.textContent).toContain('--radius-glass');
    expect(fixed?.textContent).toContain('Read-only');
    expect(editor.container.querySelector('[id*="--glass-stage"]')).toBeNull();

    editor.cleanup();
  });

  it('Given an out-of-sRGB draft, Then the warning shows the sRGB and P3 previews', () => {
    const draft = customDefinition();
    const p3: ThemeDefinition = {
      ...draft,
      light: {
        ...draft.light,
        seeds: { ...draft.light.seeds, background: 'color(display-p3 1 0 0)' },
      },
    };
    const editor = renderAdvanced(p3);
    const alert = editor.container.querySelector('[data-testid="theme-gamut-alert"]');

    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('Outside sRGB');
    expect(alert?.textContent).toContain('saving keeps the authored value');
    expect(
      alert?.querySelector('input[aria-label="sRGB fallback preview for light.seeds.background"]'),
    ).not.toBeNull();
    expect(
      alert?.querySelector('input[aria-label="Display P3 preview for light.seeds.background"]'),
    ).not.toBeNull();

    editor.cleanup();
  });

  it('Given the JSON view, Then CodeMirror renders and export stays JSON/CSS only', () => {
    const editor = renderAdvanced();

    act(() => {
      buttonByText(editor.container, 'JSON').click();
    });

    expect(editor.container.querySelector('.cm-editor')).not.toBeNull();
    expect(editor.container.textContent).toContain('Valid theme JSON');

    const links = [...editor.container.querySelectorAll('a')].map((link) => ({
      text: link.textContent.trim(),
      download: link.getAttribute('download'),
      href: link.getAttribute('href'),
    }));
    expect(links).toContainEqual({
      text: 'Export JSON',
      download: 'custom-demo.json',
      href: expect.stringContaining('data:application/json'),
    });
    expect(links).toContainEqual({
      text: 'Export CSS',
      download: 'custom-demo.css',
      href: expect.stringContaining('data:text/css'),
    });

    const fileInput = editor.container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput?.getAttribute('accept')).toBe('application/json,.json');

    editor.cleanup();
  });

  it('Given a disabled panel, Then token inputs cannot be edited', () => {
    const editor = renderAdvanced(customDefinition(), true);
    expect(
      editor.container.querySelector<HTMLInputElement>('#theme-override-light---ring')?.disabled,
    ).toBe(true);

    editor.cleanup();
  });
});
