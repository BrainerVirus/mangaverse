/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { InstalledProviderSummary } from '../../types.js';
import { ExtensionsPage } from '../ExtensionsPage.js';

const INSTALLED: InstalledProviderSummary = {
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  enabled: true,
  health: 'unknown',
  capabilityCount: 2,
  languages: ['en'],
  sourceUrl: 'https://example.com',
};

const WITH_PROVIDER = { providers: [INSTALLED], registries: [] };

function renderPage(overrides: Partial<Parameters<typeof ExtensionsPage>[0]> = {}) {
  const onImportRegistry = vi.fn<() => void>();
  const onExportExtensions = vi.fn<() => void>();
  render(
    <ExtensionsPage
      data={WITH_PROVIDER}
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
  it('Given installed providers and no registries, Then Export extensions stands alone without a registries heading', async () => {
    const user = userEvent.setup();
    const { onImportRegistry, onExportExtensions } = renderPage();

    const header = screen
      .getByRole('heading', { name: 'Extensions' })
      .closest<HTMLElement>('[data-page-header]');
    expect(within(header as HTMLElement).getAllByRole('button')).toHaveLength(2);
    expect(
      within(header as HTMLElement).getByRole('button', { name: 'Install provider' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.queryByRole('heading', { name: 'Imported registries' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Imported registries' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Export extensions' }));

    expect(onImportRegistry).toHaveBeenCalledTimes(1);
    expect(onExportExtensions).toHaveBeenCalledTimes(1);
  });

  it('Given installed providers and imported registries, Then Export extensions sits beside the registries heading', async () => {
    const user = userEvent.setup();
    const { onExportExtensions } = renderPage({
      data: {
        providers: [INSTALLED],
        registries: [{ name: 'Main registry', registryUrl: 'https://reg.example/index.json' }],
      },
    });

    const registries = screen.getByRole('region', { name: 'Imported registries' });
    await user.click(within(registries).getByRole('button', { name: 'Export extensions' }));

    expect(onExportExtensions).toHaveBeenCalledTimes(1);
  });

  it('Given no installed providers, Then only the empty state fills the body', () => {
    renderPage({ data: { providers: [], registries: [] } });

    expect(screen.getByText('No provider installed')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Imported registries' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Export/ })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
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
