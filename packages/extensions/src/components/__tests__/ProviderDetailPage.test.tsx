// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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

const activity: NonNullable<Parameters<typeof ProviderDetailPage>[0]['activity']> = {
  logs: [
    {
      id: 'log-1',
      providerId: 'audit-provider',
      level: 'error',
      code: 'extensions.sdk.request.timeout',
      message: 'Request timed out.',
      details: { operation: 'pages' },
      createdAt: '2026-01-02T12:00:00.000Z',
    },
  ],
  counts: { total: 1, info: 0, errors: 1, warnings: 0 },
  isLoading: false,
  error: null,
  level: 'all',
  onLevelChange: vi.fn<(level: 'all' | 'info' | 'warn' | 'error') => void>(),
  onClear: vi.fn<() => void>(),
  isClearing: false,
};

const healthReport: NonNullable<Parameters<typeof ProviderDetailPage>[0]['health']>['report'] = {
  providerId: 'audit-provider',
  checkedAt: '2026-01-02T12:00:00.000Z',
  status: 'degraded',
  checks: [
    { id: 'manifest', label: 'Manifest', status: 'pass' },
    {
      id: 'network',
      label: 'Network',
      status: 'degraded',
      reason: 'Request timed out.',
    },
  ],
  networkChecked: true,
};

function renderWithPanels(
  panelProps: Pick<Parameters<typeof ProviderDetailPage>[0], 'activity' | 'health' | 'update'>,
  provider = data,
) {
  return render(
    <ProviderDetailPage
      providerId="audit-provider"
      data={provider}
      isLoading={false}
      isError={false}
      onToggleEnabled={vi.fn<(enabled: boolean) => void>()}
      onSaveSettings={() => {}}
      onRemove={() => {}}
      {...panelProps}
    />,
  );
}

describe('ProviderDetailPage activity, health and updates', () => {
  it('lists activity entries and clears them', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn<() => void>();
    renderWithPanels({ activity: { ...activity, onClear } });

    expect(screen.getByText('Recent activity')).toBeInTheDocument();
    expect(screen.getByText('extensions.sdk.request.timeout')).toBeInTheDocument();
    expect(screen.getByText('Request timed out.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export activity' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Clear activity' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('shows the empty activity state', () => {
    renderWithPanels({
      activity: { ...activity, logs: [], counts: { total: 0, info: 0, errors: 0, warnings: 0 } },
    });
    expect(screen.getByText('No activity recorded for this provider.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear activity' })).toBeDisabled();
  });

  it('bases the empty level copy on the full retained counts', () => {
    renderWithPanels({
      activity: {
        ...activity,
        logs: [],
        level: 'error',
        counts: { total: 0, info: 0, errors: 0, warnings: 0 },
      },
    });
    expect(screen.getByText('No errors recorded for this provider.')).toBeInTheDocument();
  });

  it('states what the health check runs and labels the network probe', () => {
    renderWithPanels({
      health: {
        report: null,
        isChecking: false,
        error: null,
        canRunNetworkCheck: true,
        includeNetwork: false,
        onIncludeNetworkChange: vi.fn<(enabled: boolean) => void>(),
        onRun: vi.fn<() => void>(),
        lastCheckedAt: null,
      },
    });

    expect(screen.getByText(/Runs static checks on the install/)).toBeInTheDocument();
    expect(
      screen.getByText(/optional network check runs the provider's search once/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/without running provider code/)).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Include network check (runs provider search)'),
    ).toBeInTheDocument();
  });

  it('runs a health check and renders each check with reasons', async () => {
    const user = userEvent.setup();
    const onRun = vi.fn<() => void>();
    renderWithPanels({
      health: {
        report: null,
        isChecking: false,
        error: null,
        canRunNetworkCheck: true,
        includeNetwork: true,
        onIncludeNetworkChange: vi.fn<(enabled: boolean) => void>(),
        onRun,
        lastCheckedAt: null,
      },
    });

    await user.click(screen.getByRole('button', { name: 'Run health check' }));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(screen.getByText('No health check has run yet.')).toBeInTheDocument();

    cleanup();
    renderWithPanels({
      health: {
        report: healthReport,
        isChecking: false,
        error: null,
        canRunNetworkCheck: true,
        includeNetwork: false,
        onIncludeNetworkChange: vi.fn<(enabled: boolean) => void>(),
        onRun,
        lastCheckedAt: healthReport.checkedAt,
      },
    });

    const results = screen.getByRole('status', { name: 'Health check results' });
    expect(results).toHaveTextContent('degraded');
    expect(results).toHaveTextContent('Network');
    expect(results).toHaveTextContent('Request timed out.');
    expect(screen.getByText(/Last check:/)).toBeInTheDocument();
  });

  it('keeps the enable toggle usable once health recovers from broken', () => {
    const broken: ProviderDetailData = {
      ...data,
      provider: { ...data.provider, enabled: false, health: 'broken' },
    };
    renderWithPanels({}, broken);
    expect(screen.getByRole('button', { name: 'Enable provider' })).toBeDisabled();

    cleanup();
    const degraded: ProviderDetailData = {
      ...data,
      provider: { ...data.provider, enabled: false, health: 'degraded' },
    };
    renderWithPanels({}, degraded);
    expect(screen.getByRole('button', { name: 'Enable provider' })).toBeEnabled();
  });

  it('confirms an available update before applying it', async () => {
    const user = userEvent.setup();
    const onCheck = vi.fn<() => void>();
    const onApply = vi.fn<() => void>();
    const providerWithUrl: ProviderDetailData = {
      ...data,
      provider: { ...data.provider, manifestUrl: 'https://example.com/provider.json' },
    };
    renderWithPanels(
      {
        update: {
          check: {
            providerId: 'audit-provider',
            status: 'available',
            currentVersion: '1.0.0',
            checkedAt: '2026-01-02T12:00:00.000Z',
            remoteVersion: '1.2.0',
            message: 'Update available: v1.2.0.',
            remoteManifest: { ...manifest, version: '1.2.0' },
          },
          isChecking: false,
          error: null,
          onCheck,
          onApply,
          isApplying: false,
        },
      },
      providerWithUrl,
    );

    expect(screen.getByText('Update available: v1.2.0.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Update to v1.2.0' }));
    const dialog = screen.getByRole('dialog', { name: 'Update Audit Provider to v1.2.0?' });
    expect(dialog).toHaveTextContent('Enabled state and saved settings stay as they are.');
    await user.click(screen.getByRole('button', { name: 'Update provider' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onCheck).not.toHaveBeenCalled();
  });

  it('disables update checks when no manifest URL is recorded', () => {
    renderWithPanels({
      update: {
        check: null,
        isChecking: false,
        error: null,
        onCheck: vi.fn<() => void>(),
        onApply: vi.fn<() => void>(),
        isApplying: false,
      },
    });

    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
    expect(
      screen.getByText(
        'No manifest URL is recorded for this provider, so updates cannot be checked.',
      ),
    ).toBeInTheDocument();
  });
});
