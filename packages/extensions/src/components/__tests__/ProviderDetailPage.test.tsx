// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toExtensionInstallId, toProviderId } from '@app/shared';
import type { ProviderManifest } from '@app/shared';

import { ProviderDetailPage } from '../ProviderDetailPage.js';
import type { ProviderDetailData } from '../../types.js';

const manifest: ProviderManifest = {
  id: toProviderId('audit-provider'),
  name: 'Audit Provider',
  version: '1.0.0',
  source: { url: 'https://example.com/provider', publisher: 'Audit Studio' },
  compatibility: { platforms: ['web'] },
  capabilities: { 'discovery.search': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

const data: ProviderDetailData = {
  provider: {
    id: toExtensionInstallId('audit-provider'),
    manifest,
    sourceUrl: 'https://example.com/provider',
    installedVersion: '1.0.0',
    enabled: true,
    installedAt: '2026-01-01T00:00:00.000Z',
    state: 'installed',
    health: 'ok',
    warnings: [],
  },
  capabilities: [{ key: 'discovery.search', label: 'Search', enabled: true }],
  permissions: [
    { key: 'network.http', label: 'Network access', description: 'Fetch provider data.' },
  ],
  settings: {},
};

function renderPage(onRemove: () => void) {
  return render(
    <ProviderDetailPage
      providerId="audit-provider"
      data={data}
      isLoading={false}
      isError={false}
      onToggleEnabled={vi.fn<(enabled: boolean) => void>()}
      onSaveSettings={() => {}}
      onRemove={onRemove}
    />,
  );
}

describe('ProviderDetailPage uninstall confirmation', () => {
  // The detail page renders the whole extension surface in jsdom; on a loaded CI
  // runner that costs seconds per interaction (run 39723952949 hit the 5 s default
  // just on the cancel path), so this suite gets headroom instead of a global bump.
  it('keeps the provider until the confirmation is accepted', { timeout: 15_000 }, async () => {
    const user = userEvent.setup({ delay: null });
    const onRemove = vi.fn<() => void>();
    renderPage(onRemove);

    await user.click(screen.getByRole('button', { name: 'Uninstall' }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText('Audit Provider')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'Uninstall Audit Provider?' });
    expect(dialog).toHaveTextContent('removes the provider record and its saved settings');
    expect(dialog).toHaveTextContent('library, manga entries, and reading progress stay');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('removes the provider after the confirmation is accepted', async () => {
    const user = userEvent.setup({ delay: null });
    const onRemove = vi.fn<() => void>();
    renderPage(onRemove);

    await user.click(screen.getByRole('button', { name: 'Uninstall' }));
    await user.click(screen.getByRole('button', { name: 'Uninstall provider' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
