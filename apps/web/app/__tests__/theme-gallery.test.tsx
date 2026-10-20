import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { getBuiltInThemeDefinition, ThemeCustomizationPage } from '@app/theme';
import type { ThemeDefinition, ThemeSettings } from '@app/shared';

const settings: ThemeSettings = { themeId: 'default', dark: false };
const customTheme: ThemeDefinition = {
  ...getBuiltInThemeDefinition('sakura'),
  id: 'custom:sakura',
  name: 'My Sakura',
  basedOn: 'sakura',
};

function renderGallery(overrides: Partial<Parameters<typeof ThemeCustomizationPage>[0]> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onChange = vi.fn<(next: ThemeSettings) => void>();
  const onDuplicatePreset = vi.fn<(presetId: string) => void>();
  const onEditCustomTheme = vi.fn<(themeId: string) => void>();
  const onDeleteCustomTheme = vi.fn<(themeId: string) => void>();

  act(() => {
    root.render(
      <ThemeCustomizationPage
        settings={settings}
        isLoading={false}
        isError={false}
        customThemes={[customTheme]}
        onChange={onChange}
        onDuplicatePreset={onDuplicatePreset}
        onEditCustomTheme={onEditCustomTheme}
        onDeleteCustomTheme={onDeleteCustomTheme}
        {...overrides}
      />,
    );
  });

  return {
    container,
    onChange,
    onDuplicatePreset,
    onEditCustomTheme,
    onDeleteCustomTheme,
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

describe('theme gallery', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('Given built-in and custom themes, Then both sections list their cards', () => {
    const gallery = renderGallery();

    expect(gallery.container.textContent).toContain('Built-in themes');
    expect(gallery.container.textContent).toContain('Your themes');
    expect(
      gallery.container.querySelector('button[aria-label="Select Sakura theme"]'),
    ).not.toBeNull();
    expect(
      gallery.container.querySelector('button[aria-label="Select My Sakura theme"]'),
    ).not.toBeNull();

    gallery.cleanup();
  });

  it('Given a custom card, When it is selected, Then the custom themeId is persisted', () => {
    const gallery = renderGallery();

    act(() => {
      gallery.container
        .querySelector<HTMLButtonElement>('button[aria-label="Select My Sakura theme"]')
        ?.click();
    });

    expect(gallery.onChange).toHaveBeenCalledWith({ themeId: 'custom:sakura', dark: false });

    gallery.cleanup();
  });

  it('Given a built-in card, When Duplicate is pressed, Then the preset id is handed to the route', () => {
    const gallery = renderGallery();

    act(() => {
      buttonByText(gallery.container, 'Duplicate').click();
    });

    expect(gallery.onDuplicatePreset).toHaveBeenCalledWith('default');

    gallery.cleanup();
  });

  it('Given a custom card, When Delete is confirmed, Then the theme id reaches the route', () => {
    const gallery = renderGallery();

    act(() => {
      buttonByText(gallery.container, 'Delete').click();
    });
    expect(document.body.textContent).toContain('Delete “My Sakura”?');

    act(() => {
      buttonByText(document.body, 'Delete theme').click();
    });

    expect(gallery.onDeleteCustomTheme).toHaveBeenCalledWith('custom:sakura');

    gallery.cleanup();
  });

  it('Given the selected custom theme is missing, Then the provider notice is visible', () => {
    const gallery = renderGallery({
      notice: 'The selected custom theme could not be found. Showing the default theme.',
      customThemes: [],
    });

    expect(gallery.container.textContent).toContain('Theme unavailable');
    expect(gallery.container.textContent).toContain('could not be found');
    expect(gallery.container.textContent).toContain('No custom themes yet');

    gallery.cleanup();
  });
});
