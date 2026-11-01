/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { DiagnosticEvent } from '../event-log.js';
import { EventLogSection } from './EventLogSection.js';

const EVENTS: readonly DiagnosticEvent[] = [
  {
    id: '2',
    at: '2026-05-23T10:00:01.000Z',
    kind: 'error',
    message: 'Provider https://x.test/a failed',
    code: 'provider.unavailable',
  },
  {
    id: '1',
    at: '2026-05-23T10:00:00.000Z',
    kind: 'slow-provider-call',
    message: 'Search took too long',
    providerId: 'mangadex',
    durationMs: 1200,
  },
];

let createObjectURL: ReturnType<typeof vi.fn<() => string>>;
let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;
let anchorClick: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  createObjectURL = vi.fn<() => string>(() => 'blob:event-log');
  revokeObjectURL = vi.fn<(url: string) => void>();
  // jsdom has no object URLs; the component only needs these two statics.
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  anchorClick.mockRestore();
  vi.unstubAllGlobals();
});

function renderSection(overrides: Partial<Parameters<typeof EventLogSection>[0]> = {}) {
  const onClear = vi.fn<() => void>();
  const onExport = vi.fn<() => Promise<string>>(async () => '{"events":[]}');
  render(<EventLogSection events={EVENTS} onClear={onClear} onExport={onExport} {...overrides} />);
  return { onClear, onExport };
}

describe('EventLogSection', () => {
  it('lists each event with its kind, time and message', () => {
    renderSection();

    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('error')).toBeVisible();
    expect(within(panel).getByText('2026-05-23T10:00:01.000Z')).toBeVisible();
    expect(within(panel).getByText('Provider https://x.test/a failed')).toBeVisible();
    expect(within(panel).getByText('slow-provider-call')).toBeVisible();
    expect(within(panel).getByText('Search took too long')).toBeVisible();
  });

  it('filters the list by kind', () => {
    renderSection();

    fireEvent.click(screen.getByRole('tab', { name: 'Errors' }));

    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('Provider https://x.test/a failed')).toBeVisible();
    expect(within(panel).queryByText('Search took too long')).toBeNull();
  });

  it('clears the log', () => {
    const { onClear } = renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Clear log' }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('exports the log as a JSON download', async () => {
    const { onExport } = renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Export log' }));

    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:event-log'), {
      timeout: 3000,
    });
  });

  it('disables both actions when the log is empty', () => {
    renderSection({ events: [] });

    expect(screen.getByRole('button', { name: 'Export log' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear log' })).toBeDisabled();
    expect(screen.getByText('No events recorded.')).toBeVisible();
  });
});
