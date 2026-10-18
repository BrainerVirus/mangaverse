import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistenceErrorBanner } from '../../components/PersistenceErrorBanner.js';
import { LocalDbProvider, useReportPersistenceError } from '../local-db-provider.js';

const { registered, flushLocalDb } = vi.hoisted(() => ({
  registered: { handler: null as ((message: string | null) => void) | null },
  flushLocalDb: vi.fn(async () => {}),
}));

vi.mock('../../lib/local-db.js', () => ({
  getLocalDb: async () => ({ id: 'fake-db' }),
  resetLocalDb: vi.fn(),
  flushLocalDb,
  watchLocalDbForExternalChanges: () => () => {},
  setPersistenceErrorHandler: (handler: ((message: string | null) => void) | null) => {
    registered.handler = handler;
  },
}));

vi.mock('../../lib/first-party-providers.js', () => ({
  installFirstPartyProviders: vi.fn(async () => {}),
}));

function ReportProbe() {
  const report = useReportPersistenceError();
  return (
    <button type="button" onClick={() => report('progress write failed')}>
      report
    </button>
  );
}

describe('LocalDbProvider persistence wiring', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    registered.handler = null;
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

  it('Given a registered provider, When a persistence error is reported, Then the banner appears and Retry flushes', async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <LocalDbProvider>
            <PersistenceErrorBanner />
          </LocalDbProvider>
        </QueryClientProvider>,
      );
    });
    await act(async () => {});

    // The provider must register the real handler with the local-db module.
    expect(typeof registered.handler).toBe('function');

    await act(async () => {
      registered.handler?.('QuotaExceededError: storage denied');
    });
    expect(container.textContent).toContain('Saving locally failed');
    expect(container.textContent).toContain('QuotaExceededError');

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('Retry');
    await act(async () => {
      button?.click();
    });
    expect(flushLocalDb).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('Saving locally failed');

    // Unmounting must unregister the handler.
    act(() => {
      root.unmount();
    });
    expect(registered.handler).toBeNull();
  });

  it('Given a rejected write outside the flush path, When it is reported, Then the same banner shows it', async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <LocalDbProvider>
            <PersistenceErrorBanner />
            <ReportProbe />
          </LocalDbProvider>
        </QueryClientProvider>,
      );
    });
    await act(async () => {});

    const reportButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'report',
    );
    await act(async () => {
      reportButton?.click();
    });

    expect(container.textContent).toContain('Saving locally failed');
    expect(container.textContent).toContain('progress write failed');
  });
});
