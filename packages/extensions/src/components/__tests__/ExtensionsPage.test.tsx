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
      data={{ providers: [] }}
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

    await user.click(screen.getByRole('button', { name: 'Import registry' }));
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
});
