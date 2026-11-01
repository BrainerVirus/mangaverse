/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toProviderId } from '@app/shared';
import type { ProviderManifest, ProviderSettingsValues } from '@app/shared';

import { ProviderSettingsForm } from '../ProviderSettingsForm.js';

const manifest: ProviderManifest = {
  id: toProviderId('p'),
  name: 'P',
  version: '1',
  source: { url: 'https://p.example' },
  compatibility: { platforms: ['web'] },
  capabilities: {
    'discovery.search': true,
    'metadata.languages': true,
    'content.nsfw': true,
    'content.ratingFilter': true,
    'content.tagFilter': true,
  },
  capabilityDetails: [{ key: 'ops.officialApi', supported: true, rateLimitRpm: 40 }],
  settingsSupport: {
    defaultSorts: ['latest', 'popular'],
    providerOptionKeys: ['quality'],
  },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: true, suggestive: true, violence: false },
};

function renderForm(
  settings: ProviderSettingsValues = {},
  overrides: Partial<Parameters<typeof ProviderSettingsForm>[0]> = {},
) {
  const onSave = vi.fn<(value: ProviderSettingsValues) => void>();
  render(
    <ProviderSettingsForm
      manifest={manifest}
      settings={settings}
      isSaving={false}
      isSaved={false}
      errorMessage={null}
      onSave={onSave}
      {...overrides}
    />,
  );
  return { onSave };
}

describe('ProviderSettingsForm', () => {
  it('Given a pending save, Then the button keeps its label so a fast save cannot flash', () => {
    renderForm({}, { isSaving: true });

    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
    expect(screen.queryByText('Saving…')).toBeNull();
  });

  it('Given a provider without declared settings, Then no settings form renders', () => {
    render(
      <ProviderSettingsForm
        manifest={{
          ...manifest,
          capabilities: { 'discovery.search': true },
          capabilityDetails: [],
          settingsSupport: {},
        }}
        settings={{}}
        isSaving={false}
        isSaved={false}
        errorMessage={null}
        onSave={() => {}}
      />,
    );
    expect(screen.queryByTestId('provider-settings-form')).not.toBeInTheDocument();
  });

  it('Given a provider with settings capabilities, Then only declared fields render', () => {
    renderForm();
    expect(screen.getByLabelText('Preferred languages')).toBeInTheDocument();
    expect(screen.getByLabelText('Allow mature content')).toBeInTheDocument();
    expect(screen.getByLabelText('Safe')).toBeInTheDocument();
    expect(screen.getByLabelText('Included tags')).toBeInTheDocument();
    expect(screen.getByLabelText('Excluded tags')).toBeInTheDocument();
    expect(screen.getByLabelText('Default sort')).toBeInTheDocument();
    expect(screen.getByLabelText('Rate limit override (requests per minute)')).toBeInTheDocument();
    expect(screen.getByLabelText('quality')).toBeInTheDocument();
    expect(screen.queryByLabelText('Region / locale')).not.toBeInTheDocument();
  });

  it('Given edited fields, When Save is pressed, Then normalized declared settings are sent', async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();

    await user.type(screen.getByLabelText('Preferred languages'), 'en, ja');
    await user.type(screen.getByLabelText('Included tags'), 'tag-a');
    await user.click(screen.getByLabelText('Allow mature content'));
    await user.type(screen.getByLabelText('Rate limit override (requests per minute)'), '60');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(onSave).toHaveBeenCalledWith({
      preferredLanguages: ['en', 'ja'],
      nsfwAllowed: true,
      includedTags: ['tag-a'],
      rateLimitOverrideRpm: 60,
    });
  });

  it('Given invalid rate text, Then the form reports it and saves nothing', async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();

    await user.type(screen.getByLabelText('Rate limit override (requests per minute)'), '-1');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Rate limit must be a non-negative number.')).toBeInTheDocument();
  });

  it('Given saved settings, Then the draft is prefilled and can be reset', async () => {
    const user = userEvent.setup();
    renderForm({ preferredLanguages: ['en', 'ja'] });
    const input = screen.getByLabelText('Preferred languages');
    expect(input).toHaveValue('en, ja');

    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(input).toHaveValue('');
  });

  it('Given a save error, Then it is shown', () => {
    renderForm({}, { errorMessage: 'Provider settings.preferredLanguages: invalid' });
    expect(screen.getByText('Settings not saved')).toBeInTheDocument();
    expect(screen.getByText('Provider settings.preferredLanguages: invalid')).toBeInTheDocument();
  });
});
