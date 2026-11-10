/**
 * @vitest-environment jsdom
 */
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DesktopPlatformBridge, PlatformUpdateInfo, PlatformUpdateState } from '@app/platform';

import { UpdatePopover } from '../UpdatePopover.js';

const idle: PlatformUpdateState = {
  enabled: true,
  currentVersion: '1.0.0',
  lastCheckedAt: null,
  phase: { kind: 'idle' },
};
const withPhase = (phase: PlatformUpdateState['phase']): PlatformUpdateState => ({
  ...idle,
  phase,
});
const downloading = withPhase({
  kind: 'downloading',
  version: '1.1.0',
  percent: 40,
  transferred: 4_000_000,
  total: 10_000_000,
});
const ready = withPhase({ kind: 'ready', version: '1.1.0' });

function renderOpen(update: PlatformUpdateState | null, open = true) {
  const handlers = {
    onOpenChange: vi.fn<(open: boolean) => void>(),
    onLater: vi.fn<() => void>(),
    onInstall: vi.fn<() => void>(),
    onOpenSettings: vi.fn<() => void>(),
  };
  const view = render(<UpdatePopover update={update} open={open} {...handlers} />);
  return { ...handlers, ...view };
}

afterEach(() => {
  cleanup();
  delete (window as { mangaversePlatform?: unknown }).mangaversePlatform;
});

describe('UpdatePopover', () => {
  it.each([[null], [idle], [withPhase({ kind: 'checking' })]])(
    'Given nothing to install, Then there is no pill and no panel',
    (update) => {
      renderOpen(update);
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );

  it('Given it is closed, Then only the pill shows, and it reports a collapsed popup', () => {
    renderOpen(ready, false);
    expect(screen.queryByRole('dialog')).toBeNull();
    const pill = screen.getByRole('button', { name: /^Restart to update/ });
    expect(pill.getAttribute('aria-expanded')).toBe('false');
  });

  it('Given a download, Then the panel shows the version, a named progress bar at the percent and the bytes', () => {
    renderOpen(downloading);
    const panel = screen.getByRole('dialog', { name: 'Downloading MangaVerse 1.1.0' });
    expect(within(panel).getByText('It installs only when you restart.')).not.toBeNull();
    const bar = within(panel).getByRole('progressbar', { name: 'Download progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(within(panel).getByText('4.0 MB of 10.0 MB')).not.toBeNull();
    // Nothing to decide yet: the restart buttons wait for the release to be ready.
    expect(within(panel).queryByRole('button', { name: 'Restart and install' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Later' })).toBeNull();
  });

  it('Given a download of unknown size, Then the readout is the percent alone', () => {
    renderOpen(
      withPhase({ kind: 'downloading', version: '1.1.0', percent: 7, transferred: 0, total: 0 }),
    );
    expect(screen.getByText('7%', { selector: 'p' })).not.toBeNull();
  });

  it('Given a download, Then the percent is not in a live region and the title is the one status', () => {
    renderOpen(downloading);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Downloading MangaVerse 1.1.0');
    const bar = screen.getByRole('progressbar');
    expect(bar.closest('[aria-live]')).toBeNull();
    expect(bar.closest('[role="status"]')).toBeNull();
  });

  it('Given a ready release, Then it offers Later and Restart and install, and says progress is saved', () => {
    const { onLater, onInstall } = renderOpen(ready);
    const panel = screen.getByRole('dialog', { name: 'MangaVerse 1.1.0 is ready' });
    expect(
      within(panel).getByText('Restart to finish. Your reading progress is already saved.'),
    ).not.toBeNull();
    expect(within(panel).queryByRole('progressbar')).toBeNull();

    fireEvent.click(within(panel).getByRole('button', { name: 'Later' }));
    expect(onLater).toHaveBeenCalledTimes(1);
    expect(onInstall).not.toHaveBeenCalled();

    fireEvent.click(within(panel).getByRole('button', { name: 'Restart and install' }));
    expect(onInstall).toHaveBeenCalledTimes(1);
    expect(onLater).toHaveBeenCalledTimes(1);
  });

  it('Given Later is the outlined button and Restart and install the primary one', () => {
    renderOpen(ready);
    expect(screen.getByRole('button', { name: 'Later' }).className).toContain('border-border');
    expect(screen.getByRole('button', { name: 'Restart and install' }).className).toContain(
      'bg-primary',
    );
  });

  it('Given a queued restart, Then it says it waits for the end of the chapter and offers no restart', () => {
    renderOpen(withPhase({ kind: 'installing', version: '1.1.0', queued: true }));
    const panel = screen.getByRole('dialog', { name: 'Restart queued' });
    expect(
      within(panel).getByText('MangaVerse will restart when you finish reading.'),
    ).not.toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Restart and install' })).toBeNull();
  });

  it('Given a restart in progress, Then the panel says Restarting…', () => {
    renderOpen(withPhase({ kind: 'installing', version: '1.1.0', queued: false }));
    expect(screen.getByRole('dialog', { name: 'Restarting…' })).not.toBeNull();
  });

  it.each([
    ['downloading', downloading],
    ['ready', ready],
    ['queued', withPhase({ kind: 'installing', version: '1.1.0', queued: true })],
  ])('Given %s, Then an Update settings link goes to the settings page', (_phase, update) => {
    const { onOpenSettings } = renderOpen(update);
    fireEvent.click(screen.getByRole('button', { name: 'Update settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('Given the pill, Then it expands the panel, and Escape or an outside press closes it', () => {
    const { onOpenChange } = renderOpen(ready);
    expect(
      screen.getByRole('button', { name: /^Restart to update/ }).getAttribute('aria-expanded'),
    ).toBe('true');

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange.mock.calls.at(-1)![0]).toBe(false);

    onOpenChange.mockClear();
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);
    expect(onOpenChange.mock.calls.at(-1)![0]).toBe(false);
  });

  it('Given the pill is clicked while closed, Then it asks to open', () => {
    const { onOpenChange } = renderOpen(ready, false);
    fireEvent.click(screen.getByRole('button', { name: /^Restart to update/ }));
    expect(onOpenChange.mock.calls[0]![0]).toBe(true);
  });

  it('Given reduced motion, Then the panel does not animate in', () => {
    renderOpen(ready);
    expect(screen.getByRole('dialog').className).toContain('motion-reduce:animate-none');
  });
});

describe('the update popover on main’s offer', () => {
  let offer: (info: PlatformUpdateInfo) => void = () => {};
  const bridge = {
    onUpdateAvailable: vi.fn<(listener: (info: PlatformUpdateInfo) => void) => () => void>(
      (listener) => {
        offer = listener;
        return () => {};
      },
    ),
    updateDismiss: vi.fn<() => Promise<unknown>>(async () => undefined),
    updateInstall: vi.fn<() => Promise<unknown>>(async () => undefined),
  };

  async function harness() {
    vi.resetModules();
    const popoverStore = await import('../../../lib/update-popover-store.js');
    const promptStore = await import('../../../lib/update-prompt-store.js');
    const { UpdatePopover: FreshPopover } = await import('../UpdatePopover.js');
    function Harness({ update }: { update: PlatformUpdateState }) {
      const open = useSyncExternalStore(
        popoverStore.subscribeUpdatePopover,
        popoverStore.getUpdatePopoverOpenSnapshot,
        popoverStore.getServerUpdatePopoverOpenSnapshot,
      );
      return (
        <>
          <label>
            Search
            <input />
          </label>
          <FreshPopover
            update={update}
            open={open}
            onOpenChange={popoverStore.setUpdatePopoverOpen}
            onLater={() => {
              promptStore.dismissUpdatePrompt();
              popoverStore.setUpdatePopoverOpen(false);
            }}
            onInstall={promptStore.installUpdatePrompt}
            onOpenSettings={() => {}}
          />
        </>
      );
    }
    return { Harness, popoverStore };
  }

  beforeEach(() => {
    bridge.onUpdateAvailable.mockClear();
    bridge.updateDismiss.mockClear();
    bridge.updateInstall.mockClear();
    (window as unknown as { mangaversePlatform: unknown }).mangaversePlatform =
      bridge as unknown as DesktopPlatformBridge;
  });

  it('Given the ready offer, Then the panel opens by itself and focus stays where the reader had it', async () => {
    const { Harness } = await harness();
    render(<Harness update={ready} />);
    const field = screen.getByRole('textbox');
    field.focus();
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => offer({ version: '1.1.0' }));

    expect(screen.getByRole('dialog', { name: 'MangaVerse 1.1.0 is ready' })).not.toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it('Given a click on the pill, Then the panel opens and takes focus', async () => {
    const { Harness } = await harness();
    const user = userEvent.setup();
    render(<Harness update={ready} />);
    await user.click(screen.getByRole('button', { name: /^Restart to update/ }));
    const panel = await screen.findByRole('dialog');
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
  });

  it('Given the pill is activated from the keyboard, Then the panel opens and takes focus', async () => {
    const { Harness } = await harness();
    const user = userEvent.setup();
    render(<Harness update={ready} />);
    screen.getByRole('button', { name: /^Restart to update/ }).focus();
    await user.keyboard('{Enter}');
    const panel = await screen.findByRole('dialog');
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
  });

  it('Given the offer was shown, When the title bar remounts, Then the same version does not reopen it', async () => {
    const { Harness } = await harness();
    const first = render(<Harness update={ready} />);
    act(() => offer({ version: '1.1.0' }));
    expect(screen.getByRole('dialog')).not.toBeNull();
    first.unmount();

    render(<Harness update={ready} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Given an offer, When Later is pressed, Then the panel closes, main is told and the pill stays', async () => {
    const { Harness } = await harness();
    render(<Harness update={ready} />);
    act(() => offer({ version: '1.1.0' }));

    fireEvent.click(screen.getByRole('button', { name: 'Later' }));

    expect(bridge.updateDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /^Restart to update/ })).not.toBeNull();
  });

  it('Given an offer, When Restart and install is pressed, Then main installs', async () => {
    const { Harness } = await harness();
    render(<Harness update={ready} />);
    act(() => offer({ version: '1.1.0' }));

    fireEvent.click(screen.getByRole('button', { name: 'Restart and install' }));

    expect(bridge.updateInstall).toHaveBeenCalledTimes(1);
    expect(bridge.updateDismiss).not.toHaveBeenCalled();
  });

  it('Given a newer version is offered later, Then the panel opens again for it', async () => {
    const { Harness } = await harness();
    render(<Harness update={ready} />);
    act(() => offer({ version: '1.1.0' }));
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => offer({ version: '1.2.0' }));
    expect(screen.getByRole('dialog')).not.toBeNull();
  });
});
