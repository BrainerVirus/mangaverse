// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAppError, err, getDefaultAppSettings, ok } from '@app/shared';
import type { fetchAppSettings } from '@/features/settings/fetch-app-settings.js';
import type { saveAppSettings } from '@/features/settings/save-app-settings.js';
import { settingsQueryKeys } from '@/features/settings';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<typeof fetchAppSettings>(),
  save: vi.fn<typeof saveAppSettings>(),
}));
vi.mock('../../providers/local-db-provider.js', () => ({
  useLocalDb: () => ({}),
  useLocalDbStatus: () => 'ready',
}));
vi.mock('@app/cache', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getCoverCacheUsage: async () => ({ totalBytes: 0 }),
}));
vi.mock('@/features/settings', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  fetchAppSettings: mocks.fetch,
  saveAppSettings: mocks.save,
}));
import { Route } from '../../routes/settings.app.js';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('app cache limit', () => {
  it('keeps invalid and empty drafts local, then saves a correction', async () => {
    let durable = getDefaultAppSettings();
    mocks.fetch.mockImplementation(async () => ({ settings: durable }));
    mocks.save.mockImplementation(async (_db, settings) => {
      durable = settings;
      return ok(undefined);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <Route.options.component />
      </QueryClientProvider>,
    );
    const input = (await screen.findByLabelText('Local cache limit')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '20' } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(durable.imageCacheLimitBytes).toBe(524288000);
    expect(input.value).toBe('20');
    expect(screen.getByText(/50.*10.?240/i)).toBeTruthy();
    fireEvent.change(input, { target: { value: '' } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '200' } });
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(durable.imageCacheLimitBytes).toBe(209715200);
    view.unmount();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Route.options.component />
      </QueryClientProvider>,
    );
    expect(((await screen.findByLabelText('Local cache limit')) as HTMLInputElement).value).toBe(
      '200',
    );
  });

  it('retains a failed cache limit draft and offers a field-specific retry', async () => {
    const durable = getDefaultAppSettings();
    mocks.fetch.mockResolvedValue({ settings: durable });
    mocks.save.mockResolvedValue(
      err(createAppError({ code: 'storage.error', message: 'storage unavailable' })),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Route.options.component />
      </QueryClientProvider>,
    );
    const input = (await screen.findByLabelText('Local cache limit')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '200' } });
    await screen.findByText(/Could not save the local cache limit/);
    expect(input.value).toBe('200');
    expect(durable.imageCacheLimitBytes).toBe(524288000);
    await waitFor(() =>
      expect(client.getQueryData(settingsQueryKeys.app())).toEqual({ settings: durable }),
    );
    fireEvent.blur(input);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
  });
});
