/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  ExtensionImportPreview,
  ExtensionInstallPreview,
  ExtensionInstallSession,
  ExtensionListImportPreparation,
} from '@app/extensions-core';
import { toProviderId } from '@app/shared';

import { RegistryImportDialog } from '../RegistryImportDialog.js';

const preview: ExtensionImportPreview = {
  kind: 'registry',
  registries: [{ name: 'Main', registryUrl: 'https://reg.example/index.json' }],
  entries: [{ name: 'A', manifestUrl: 'https://a.example/manifest.json' }],
  providers: [],
  warnings: [
    {
      code: 'extensions.core.registry.bad_entry',
      message: 'Entry 1 is invalid.',
      severity: 'warning',
    },
  ],
};

const manifest = {
  id: toProviderId('demo'),
  name: 'Demo Provider',
  version: '1.0.0',
  source: { url: 'https://demo.example', publisher: 'Demo Publisher' },
  compatibility: { platforms: ['web'] },
  capabilities: { 'discovery.search': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: true, suggestive: false, violence: false },
} as const;

const installPreview: ExtensionInstallPreview = {
  providerName: manifest.name,
  providerId: manifest.id,
  version: manifest.version,
  publisher: manifest.source.publisher,
  sourceUrl: manifest.source.url,
  manifestUrl: 'https://demo.example/manifest.json',
  platforms: manifest.compatibility.platforms,
  capabilities: manifest.capabilities,
  capabilityLimitations: [],
  permissions: manifest.permissions,
  languages: manifest.languages,
  contentFlags: manifest.contentFlags,
  checksumStatus: 'absent',
  signatureStatus: 'absent',
  warnings: [],
};

const extensionPreview: ExtensionImportPreview = {
  kind: 'extension-list',
  registries: [],
  entries: [],
  providers: [
    {
      name: manifest.name,
      manifestUrl: 'https://demo.example/manifest.json',
      installedVersion: '0.9.0',
      enabled: true,
    },
  ],
  warnings: [],
};

const session: ExtensionInstallSession = {
  step: 'awaitingConfirmation',
  manifest: { ...manifest, id: toProviderId('demo') },
  preview: installPreview,
  source: { kind: 'manual', manifestUrl: 'https://demo.example/manifest.json' },
  warnings: [],
};

const preparation: ExtensionListImportPreparation = {
  registries: [],
  sessions: [
    {
      entry: extensionPreview.providers[0]!,
      session,
    },
  ],
  warnings: [],
};

function renderDialog(overrides: Partial<Parameters<typeof RegistryImportDialog>[0]> = {}) {
  const onConfirm = vi.fn<() => void>();
  const onPreviewText = vi.fn<() => void>();
  const onPreviewUrl = vi.fn<() => void>();
  const onJsonTextChange = vi.fn<(value: string) => void>();
  render(
    <RegistryImportDialog
      open
      onOpenChange={() => {}}
      jsonText=""
      onJsonTextChange={onJsonTextChange}
      url=""
      onUrlChange={() => {}}
      preview={null}
      preparation={null}
      isLoading={false}
      errorMessage={null}
      onPreviewText={onPreviewText}
      onPreviewUrl={onPreviewUrl}
      onConfirm={onConfirm}
      onCancel={() => {}}
      {...overrides}
    />,
  );
  return { onConfirm, onPreviewText, onPreviewUrl, onJsonTextChange };
}

describe('RegistryImportDialog', () => {
  it('Given pasted text, When Preview is pressed, Then parsing is requested', async () => {
    const user = userEvent.setup();
    const { onPreviewText } = renderDialog({ jsonText: '{"name":"Main"}' });

    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(onPreviewText).toHaveBeenCalledTimes(1);
  });

  it('Given a registry preview, Then entries and warnings are shown before confirming', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({ preview });

    expect(screen.getByTestId('registry-import-preview')).toHaveTextContent('Main');
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('Entry 1 is invalid.')).toBeInTheDocument();
    expect(screen.getByText(/adds no provider entries/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Import registry' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Given an extension export preview, Then manifest details are shown before consent', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({ preview: extensionPreview, preparation });

    const panel = screen.getByTestId('extension-list-import-preview');
    expect(panel).toHaveTextContent('Demo Provider');
    expect(panel).toHaveTextContent('Demo Publisher');
    expect(panel).toHaveTextContent('https://demo.example');
    expect(panel).toHaveTextContent('NSFW');
    expect(panel).toHaveTextContent('Updates 0.9.0 → 1.0.0');

    await user.click(screen.getByRole('button', { name: 'Import extensions' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Given no reviewed providers, Then extension import is disabled', () => {
    renderDialog({
      preview: { ...extensionPreview, warnings: [] },
      preparation: { registries: [], sessions: [], warnings: [] },
    });
    expect(screen.getByRole('button', { name: 'Import extensions' })).toBeDisabled();
  });

  it('Given an import error, Then it is shown and nothing is confirmed', () => {
    const { onConfirm } = renderDialog({ errorMessage: 'Registry name is required.' });

    expect(screen.getByText('Registry name is required.')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Given a URL, When Load is pressed, Then the URL preview is requested', async () => {
    const user = userEvent.setup();
    const { onPreviewUrl } = renderDialog({ url: 'https://reg.example/index.json' });

    await user.click(screen.getByRole('button', { name: 'Load' }));

    expect(onPreviewUrl).toHaveBeenCalledTimes(1);
  });

  it('Given no preview, Then there is no confirm action yet', () => {
    renderDialog({ jsonText: '{}' });
    expect(screen.queryByRole('button', { name: 'Import registry' })).not.toBeInTheDocument();
  });

  it('Given a loading fetch, Then Cancel stays available', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn<() => void>();
    renderDialog({ isLoading: true, onCancel });

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toBeEnabled();
    await user.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
