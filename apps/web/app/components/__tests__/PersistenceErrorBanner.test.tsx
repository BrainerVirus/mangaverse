import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { PersistenceErrorBanner } from '../PersistenceErrorBanner.js';

const { state } = vi.hoisted(() => ({
  state: {
    message: null as string | null,
    retry: vi.fn(),
  },
}));

vi.mock('../../providers/local-db-provider.js', () => ({
  usePersistenceError: () => state.message,
  useRetryPersistence: () => state.retry,
}));

describe('PersistenceErrorBanner', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    state.message = null;
    state.retry.mockClear();
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

  it('Given no persistence error, When rendered, Then nothing is shown', async () => {
    await act(async () => {
      root.render(<PersistenceErrorBanner />);
    });
    expect(container.textContent).toBe('');
  });

  it('Given a persistence error, When Retry is pressed, Then the retry handler runs', async () => {
    state.message = 'QuotaExceededError';
    await act(async () => {
      root.render(<PersistenceErrorBanner />);
    });

    expect(container.textContent).toContain('Saving locally failed');
    expect(container.textContent).toContain('QuotaExceededError');

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('Retry');
    await act(async () => {
      button?.click();
    });
    expect(state.retry).toHaveBeenCalledTimes(1);
  });
});
