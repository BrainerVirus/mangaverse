/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  SETTINGS_WRITE_DELAY_MS,
  useCoalescedSettingsWrite,
  useScopedCoalescedSettingsWrite,
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

type Scope = 'title' | 'global';

function ScopedProbe({ write }: { readonly write: (scope: Scope, value: string) => void }) {
  const writer = useScopedCoalescedSettingsWrite(write);
  return (
    <>
      <button
        type="button"
        data-testid="schedule-title"
        onClick={() => writer.schedule('title', 'title-value')}
      >
        title
      </button>
      <button
        type="button"
        data-testid="schedule-global"
        onClick={() => writer.schedule('global', 'global-value')}
      >
        global
      </button>
      <button type="button" data-testid="cancel-title" onClick={() => writer.cancel('title')}>
        cancel title
      </button>
      <button type="button" data-testid="cancel-global" onClick={() => writer.cancel('global')}>
        cancel global
      </button>
      <button type="button" data-testid="flush" onClick={() => writer.flush()}>
        flush
      </button>
    </>
  );
}

describe('useScopedCoalescedSettingsWrite', () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  function mountScoped(write: (scope: Scope, value: string) => void) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<ScopedProbe write={write} />));
  }

  function clickScoped(testId: string) {
    act(() => container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click());
  }

  it('Given both scopes queued, When the title scope is cancelled, Then the global edit still lands', () => {
    vi.useFakeTimers();
    const write = vi.fn<(scope: Scope, value: string) => void>();
    mountScoped(write);

    clickScoped('schedule-title');
    clickScoped('schedule-global');
    clickScoped('cancel-title');
    act(() => {
      vi.advanceTimersByTime(SETTINGS_WRITE_DELAY_MS);
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('global', 'global-value');
  });

  it('Given both scopes queued, When the global scope is cancelled, Then the title edit still lands', () => {
    vi.useFakeTimers();
    const write = vi.fn<(scope: Scope, value: string) => void>();
    mountScoped(write);

    clickScoped('schedule-title');
    clickScoped('schedule-global');
    clickScoped('cancel-global');
    act(() => {
      vi.advanceTimersByTime(SETTINGS_WRITE_DELAY_MS);
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('title', 'title-value');
  });

  it('Given scopes scheduled at different times, Then each keeps its own quiet window', () => {
    vi.useFakeTimers();
    const write = vi.fn<(scope: Scope, value: string) => void>();
    mountScoped(write);

    clickScoped('schedule-title');
    act(() => {
      vi.advanceTimersByTime(SETTINGS_WRITE_DELAY_MS - 100);
    });
    clickScoped('schedule-global');
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('title', 'title-value');

    act(() => {
      vi.advanceTimersByTime(SETTINGS_WRITE_DELAY_MS - 100);
    });
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith('global', 'global-value');
  });

  it('Given both scopes queued, When flushed, Then each writes once', () => {
    vi.useFakeTimers();
    const write = vi.fn<(scope: Scope, value: string) => void>();
    mountScoped(write);

    clickScoped('schedule-title');
    clickScoped('schedule-global');
    clickScoped('flush');

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledWith('title', 'title-value');
    expect(write).toHaveBeenCalledWith('global', 'global-value');

    act(() => {
      vi.advanceTimersByTime(SETTINGS_WRITE_DELAY_MS);
    });
    expect(write).toHaveBeenCalledTimes(2);
  });
});
