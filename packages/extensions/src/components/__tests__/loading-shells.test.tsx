// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { ExtensionsPage } from '../ExtensionsPage.js';
import { ProviderDetailPage } from '../ProviderDetailPage.js';
import type { InstalledProviderSummary } from '../../types.js';

const noop = () => {};

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

function extensionsPage(props: Partial<Parameters<typeof ExtensionsPage>[0]>) {
  return (
    <ExtensionsPage
      data={undefined}
      isLoading={false}
      isError={false}
      onOpenProvider={noop}
      onInstallProvider={noop}
      onImportRegistry={noop}
      onExportExtensions={noop}
      onToggleEnabled={noop}
      {...props}
    />
  );
}

describe('ExtensionsPage while the providers load', () => {
  it('keeps its header and both actions, and does not claim a provider count it has not read', () => {
    render(extensionsPage({ isLoading: true }));

    expect(screen.getByRole('heading', { level: 1, name: 'Extensions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install provider' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled();
    expect(screen.queryByText('0 installed providers')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Install a provider/)).not.toBeInTheDocument();
  });

  it('lays its card placeholders out in the provider grid that replaces them', () => {
    const { container: loading } = render(extensionsPage({ isLoading: true }));
    const placeholder = loading.querySelector('section[aria-label="Installed providers"]');
    expect(placeholder).toHaveAttribute('aria-busy', 'true');
    expect(placeholder?.querySelectorAll('.rounded-box.border')).toHaveLength(2);
    const placeholderClass = placeholder?.className;
    cleanup();

    const { container: loaded } = render(
      extensionsPage({ data: { providers: [INSTALLED], registries: [] } }),
    );
    const grid = loaded.querySelector('section[aria-label="Installed providers"]');
    expect(grid?.className).toBe(placeholderClass);
  });
});

describe('ProviderDetailPage while the provider loads', () => {
  it('keeps the Back link and the sections frame', () => {
    const onBack = vi.fn<() => void>();
    const { container } = render(
      <ProviderDetailPage
        providerId="demo"
        data={undefined}
        isLoading
        isError={false}
        onBack={onBack}
        onToggleEnabled={noop}
        onSaveSettings={noop}
        onRemove={noop}
      />,
    );

    expect(screen.getByRole('button', { name: 'Back to extensions' })).toBeEnabled();
    expect(screen.getByRole('region', { name: 'Provider details' })).toBeInTheDocument();
    expect(container.querySelectorAll('.rounded-box.border').length).toBeGreaterThanOrEqual(3);
  });
});
