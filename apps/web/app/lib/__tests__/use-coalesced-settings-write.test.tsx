/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  SETTINGS_WRITE_DELAY_MS,
  useCoalescedSettingsWrite,
} from '../use-coalesced-settings-write.js';

function Probe({ write }: { readonly write: (value: number) => void }) {
  const writer = useCoalescedSettingsWrite(write);
  return (
    <>
      <button
        type="button"
        data-testid="burst"
        onClick={() => {
          for (let value = 0; value < 20; value++) writer.schedule(value);
        }}
      >
        burst
      </button>
      <button type="button" data-testid="flush" onClick={() => writer.flush()}>
        flush
      </button>
    </>
  );
}

describe('useCoalescedSettingsWrite', () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  function mount(write: (value: number) => void) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Probe write={write} />));
  }

  function click(testId: string) {
    act(() => container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click());
  }

  it('Given 20 edits in one gesture, Then one write carries the last value', () => {
    vi.useFakeTimers();
    const write = vi.fn<(value: number) => void>();
    mount(write);

    click('burst');

    expect(write).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(SETTINGS_WRITE_DELAY_MS - 1);
    });
    expect(write).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(19);
  });

  it('Given a pause between bursts, Then each burst writes once', () => {
    vi.useFakeTimers();
    const write = vi.fn<(value: number) => void>();
    mount(write);

    click('burst');
    act(() => {
      vi.advanceTimersByTime(SETTINGS_WRITE_DELAY_MS);
    });
    click('burst');
    act(() => {
      vi.advanceTimersByTime(SETTINGS_WRITE_DELAY_MS);
    });

    expect(write).toHaveBeenCalledTimes(2);
  });

  it('Given a pending edit, When the interaction ends, Then it writes immediately once', () => {
    vi.useFakeTimers();
    const write = vi.fn<(value: number) => void>();
    mount(write);

    click('burst');
    click('flush');

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(19);
    act(() => {
      vi.advanceTimersByTime(SETTINGS_WRITE_DELAY_MS);
    });
    expect(write).toHaveBeenCalledTimes(1);
  });
});
