/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExtensionRegistryImportResult } from '@app/extensions-core';

import { RegistryImportDialog } from '../RegistryImportDialog.js';

const preview: ExtensionRegistryImportResult = {
  registry: { name: 'Main', registryUrl: 'https://reg.example/index.json' },
  entries: [{ name: 'A', manifestUrl: 'https://a.example/manifest.json' }],
  warnings: [
    {
      code: 'extensions.core.registry.bad_entry',
      message: 'Entry 1 is invalid.',
      severity: 'warning',
    },
  ],
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

    await user.click(screen.getByRole('button', { name: 'Preview registry' }));

    expect(onPreviewText).toHaveBeenCalledTimes(1);
  });

  it('Given a preview, Then entries and warnings are shown before confirming', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({ preview });

    expect(screen.getByTestId('registry-import-preview')).toHaveTextContent('Main');
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('Entry 1 is invalid.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Import registry' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
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
});
