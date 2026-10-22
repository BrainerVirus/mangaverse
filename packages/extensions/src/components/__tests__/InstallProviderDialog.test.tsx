// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ProviderManifest } from '@app/shared';
import type { ExtensionInstallPreview, ExtensionInstallSession } from '@app/extensions-core';

import { InstallProviderDialog } from '../InstallProviderDialog.js';

function preview(contentFlags: ProviderManifest['contentFlags']): ExtensionInstallPreview {
  return {
    providerName: 'Audit Provider',
    providerId: 'audit-provider',
    version: '1.0.0',
    publisher: 'Audit Studio',
    sourceUrl: 'https://example.com/provider',
    platforms: ['web'],
    capabilities: { 'discovery.search': true },
    capabilityLimitations: [],
    permissions: ['network.http'],
    languages: ['en'],
    contentFlags,
    checksumStatus: 'absent',
    signatureStatus: 'absent',
    warnings: [],
  };
}

function session(value: ExtensionInstallPreview): ExtensionInstallSession {
  return { step: 'awaitingConfirmation', preview: value, warnings: [] };
}

function renderDialog(value: ExtensionInstallPreview) {
  return render(
    <InstallProviderDialog
      open
      onOpenChange={vi.fn<(open: boolean) => void>()}
      manifestUrl="https://example.com/manifest.json"
      onManifestUrlChange={vi.fn<(value: string) => void>()}
      session={session(value)}
      isLoading={false}
      errorMessage={null}
      onFetchManifest={vi.fn<() => void>()}
      onConfirmInstall={vi.fn<() => void>()}
      onCancel={vi.fn<() => void>()}
    />,
  );
}

describe('InstallProviderDialog consent metadata', () => {
  it('shows the publisher, every declared flag, and a mature warning when all flags are true', () => {
    renderDialog(preview({ nsfw: true, suggestive: true, violence: true }));

    expect(screen.getByText('Audit Studio')).toBeInTheDocument();
    expect(screen.getByText('NSFW')).toBeInTheDocument();
    expect(screen.getByText('Suggestive')).toBeInTheDocument();
    expect(screen.getByText('Violence')).toBeInTheDocument();
    expect(screen.getAllByText('Yes')).toHaveLength(3);
    expect(screen.queryByText('No')).not.toBeInTheDocument();
    expect(screen.getByText('Mature content')).toBeInTheDocument();
    expect(screen.getByText(/NSFW, Suggestive, Violence content/)).toBeInTheDocument();
  });

  it('shows all flags as false without a mature warning for a clean manifest', () => {
    renderDialog(preview({ nsfw: false, suggestive: false, violence: false }));

    expect(screen.getByText('Audit Studio')).toBeInTheDocument();
    expect(screen.getAllByText('No')).toHaveLength(3);
    expect(screen.queryByText('Yes')).not.toBeInTheDocument();
    expect(screen.queryByText('Mature content')).not.toBeInTheDocument();
  });
});
