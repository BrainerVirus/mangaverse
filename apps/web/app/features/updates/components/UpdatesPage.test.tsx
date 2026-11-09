/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PlatformUpdateState } from '@app/platform';

import { UpdatesPage } from './UpdatesPage.js';

const idle: PlatformUpdateState = {
  enabled: true,
  currentVersion: '0.0.4-nightly.20261109.2',
  lastCheckedAt: '2026-11-09T12:00:00.000Z',
  phase: { kind: 'idle' },
};

function renderPage(state: PlatformUpdateState | null, isDesktop = true) {
  const onCheck = vi.fn<() => void>();
  const onInstall = vi.fn<() => void>();
  render(
    <UpdatesPage state={state} isDesktop={isDesktop} onCheck={onCheck} onInstall={onInstall} />,
  );
  return { onCheck, onInstall };
}

describe('UpdatesPage', () => {
  it('Given an idle app, Then it shows the version and channel, and Check for updates asks main', () => {
    const { onCheck } = renderPage(idle);
    expect(screen.getByText('0.0.4-nightly.20261109.2')).toBeTruthy();
    expect(screen.getByText('Nightly')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('You are up to date');
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it('Given a check is running, Then the button is disabled', () => {
    renderPage({ ...idle, phase: { kind: 'checking' } });
    expect(screen.getByRole('button', { name: 'Checking…' }).hasAttribute('disabled')).toBe(true);
  });

  it('Given a download, Then the percent is shown but not announced', () => {
    renderPage({
      ...idle,
      phase: { kind: 'downloading', version: '1.2.0', percent: 40, transferred: 4, total: 10 },
    });
    expect(screen.getByRole('status').textContent).toBe('Downloading 1.2.0');
    expect(screen.getByText(/40%/)).toBeTruthy();
  });

  it('Given a ready update, Then the action is Restart and install', () => {
    const { onCheck, onInstall } = renderPage({
      ...idle,
      phase: { kind: 'ready', version: '1.2.0' },
    });
    expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restart and install' }));
    expect(onInstall).toHaveBeenCalledTimes(1);
    expect(onCheck).not.toHaveBeenCalled();
  });

  it('Given a build with updates off, Then checking is disabled and says why', () => {
    renderPage({ ...idle, enabled: false });
    expect(screen.getByRole('button', { name: 'Check for updates' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByRole('status').textContent).toBe('Updates are off in this build');
  });

  it('Given the web build, Then it explains and offers no button', () => {
    renderPage(null, false);
    expect(screen.getByText(/handled by the desktop app/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('Given the state is not known yet, Then it shows loading and no button', () => {
    renderPage(null);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
