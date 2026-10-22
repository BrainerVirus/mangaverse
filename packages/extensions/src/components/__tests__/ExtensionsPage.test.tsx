/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ExtensionsPage } from '../ExtensionsPage.js';

function renderPage(overrides: Partial<Parameters<typeof ExtensionsPage>[0]> = {}) {
  const onImportRegistry = vi.fn<() => void>();
  const onExportExtensions = vi.fn<() => void>();
  render(
    <ExtensionsPage
      data={{ providers: [], registries: [] }}
      isLoading={false}
      isError={false}
      onOpenProvider={() => {}}
      onInstallProvider={() => {}}
      onImportRegistry={onImportRegistry}
      onExportExtensions={onExportExtensions}
      onToggleEnabled={() => {}}
      {...overrides}
    />,
  );
  return { onImportRegistry, onExportExtensions };
}

describe('ExtensionsPage registry actions', () => {
  it('Given the extensions page, Then import and export controls are available', async () => {
    const user = userEvent.setup();
    const { onImportRegistry, onExportExtensions } = renderPage();

    await user.click(screen.getByRole('button', { name: 'Import' }));
    await user.click(screen.getByRole('button', { name: 'Export installed extensions' }));

    expect(onImportRegistry).toHaveBeenCalledTimes(1);
    expect(onExportExtensions).toHaveBeenCalledTimes(1);
  });

  it('Given an export in flight, Then the control is disabled', () => {
    renderPage({ isExporting: true });
    expect(screen.getByRole('button', { name: 'Exporting…' })).toBeDisabled();
  });

  it('Given an export error, Then it is shown', () => {
    renderPage({ exportError: 'Could not export installed extensions.' });
    expect(screen.getByText('Export failed')).toBeInTheDocument();
    expect(screen.getByText('Could not export installed extensions.')).toBeInTheDocument();
  });

  it('Given export warnings, Then they are shown', () => {
    renderPage({
      exportWarnings: ['Bundled Provider has no recorded manifest URL and will be skipped.'],
    });
    expect(screen.getByText('Exported with warnings')).toBeInTheDocument();
    expect(
      screen.getByText('Bundled Provider has no recorded manifest URL and will be skipped.'),
    ).toBeInTheDocument();
  });

  it('Given import warnings, Then they are shown', () => {
    renderPage({ importWarnings: ['Demo: manifest fetch failed.'] });
    expect(screen.getByText('Import finished with warnings')).toBeInTheDocument();
    expect(screen.getByText('Demo: manifest fetch failed.')).toBeInTheDocument();
  });

  it('Given imported registries, Then they are listed', () => {
    renderPage({
      data: {
        providers: [],
        registries: [{ name: 'Main registry', registryUrl: 'https://reg.example/index.json' }],
      },
    });

    expect(screen.getByRole('region', { name: 'Imported registries' })).toBeInTheDocument();
    expect(screen.getByText('Main registry')).toBeInTheDocument();
    expect(screen.getByText('https://reg.example/index.json')).toBeInTheDocument();
  });
});
