import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocalDbErrorBanner, PersistenceErrorBanner } from '../PersistenceErrorBanner.js';
import { LocalDbProvider, useLocalDbStatus } from '../../providers/local-db-provider.js';

const { getLocalDb, resetLocalDb, flushLocalDb, registered } = vi.hoisted(() => ({
  getLocalDb: vi.fn<() => Promise<{ id: string }>>(),
  resetLocalDb: vi.fn<() => void>(),
  flushLocalDb: vi.fn<() => Promise<void>>(async () => {}),
  registered: { handler: null as ((message: string | null) => void) | null },
}));

vi.mock('../../lib/local-db.js', () => ({
  getLocalDb,
  resetLocalDb,
  flushLocalDb,
  watchLocalDbForExternalChanges: () => () => {},
  setPersistenceErrorHandler: (handler: ((message: string | null) => void) | null) => {
    registered.handler = handler;
  },
}));

vi.mock('../../lib/first-party-providers.js', () => ({
  installFirstPartyProviders: vi.fn<() => Promise<void>>(async () => {}),
}));

function StatusProbe() {
  return <span data-db-status>{useLocalDbStatus()}</span>;
}

describe('local database error banners', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    registered.handler = null;
    getLocalDb.mockReset();
    getLocalDb.mockResolvedValue({ id: 'fake-db' });
    resetLocalDb.mockClear();
    flushLocalDb.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function renderBanners() {
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <LocalDbProvider>
            <LocalDbErrorBanner />
            <PersistenceErrorBanner />
            <StatusProbe />
          </LocalDbProvider>
        </QueryClientProvider>,
      );
    });
    await act(async () => {});
  }

  function buttonByText(label: string): HTMLButtonElement | undefined {
    return [...container.querySelectorAll('button')].find((button) => button.textContent === label);
  }

  it('Given the database is still loading, When rendered, Then no banner is shown', async () => {
    getLocalDb.mockReturnValue(new Promise(() => {}));
    await renderBanners();

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain('Could not open the local library');
  });

  it('Given the database fails to open, Then the alert shows the formatted error and its action reopens it', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    getLocalDb.mockRejectedValueOnce(new Error('SecurityError: IndexedDB access is blocked'));
    await renderBanners();

    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent).toContain('Could not open the local library');
    expect(alerts[0]?.textContent).toContain('SecurityError: IndexedDB access is blocked');
    expect(container.querySelector('[data-db-status]')?.textContent).toBe('error');

    const button = buttonByText('Reopen database');
    expect(button?.textContent).toBe('Reopen database');
    await act(async () => {
      button?.click();
    });
    await act(async () => {});

    expect(resetLocalDb).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[data-db-status]')?.textContent).toBe('ready');
    consoleError.mockRestore();
  });

  it('Given the database is ready, Then no banner is shown and persistence failures still use their own banner', async () => {
    await renderBanners();

    expect(container.querySelector('[data-db-status]')?.textContent).toBe('ready');
    expect(container.querySelector('[role="alert"]')).toBeNull();

    await act(async () => {
      registered.handler?.('QuotaExceededError: storage denied');
    });

    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent).toContain('Saving locally failed');
    expect(alerts[0]?.textContent).toContain('QuotaExceededError: storage denied');
    expect(container.textContent).not.toContain('Could not open the local library');

    await act(async () => {
      buttonByText('Retry')?.click();
    });
    expect(flushLocalDb).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
