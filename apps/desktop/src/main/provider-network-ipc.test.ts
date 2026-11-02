import { describe, expect, it } from 'vitest';
import { PLATFORM_IPC } from '@app/platform';
import { createProviderAllowlist } from './provider-allowlist.js';
import { registerProviderNetworkIpc } from './provider-network-ipc.js';

function register(opts: { trusted?: boolean } = {}) {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const ipcMain = {
    handle: (channel: string, fn: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, fn);
    },
  };
  const allowlist = createProviderAllowlist();
  registerProviderNetworkIpc({
    ipcMain: ipcMain as never,
    allowlist,
    isTrustedFrame: (() => opts.trusted !== false) as never,
  });
  const call = (channel: string, ...args: unknown[]) =>
    handlers.get(channel)!({ senderFrame: {} as never }, ...args);
  return { allowlist, call };
}

describe('registerProviderNetworkIpc', () => {
  it('registers manifest domains and lets only those hosts through', async () => {
    const { allowlist, call } = register();

    const result = (await call(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, {
      providerId: 'mangadex',
      domains: ['api.mangadex.org', '*.mangadex.network'],
    })) as { ok: boolean };

    expect(result.ok).toBe(true);
    expect(allowlist.allowsUrl('mangadex', 'https://api.mangadex.org/manga')).toBe(true);
    expect(allowlist.allowsUrl('mangadex', 'https://evil.example/manga')).toBe(false);
  });

  it('unregisters on uninstall', async () => {
    const { allowlist, call } = register();
    await call(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, {
      providerId: 'mangadex',
      domains: ['api.mangadex.org'],
    });

    const result = (await call(PLATFORM_IPC.PROVIDER_NETWORK_UNREGISTER, 'mangadex')) as {
      ok: boolean;
    };

    expect(result.ok).toBe(true);
    expect(allowlist.allowsUrl('mangadex', 'https://api.mangadex.org/manga')).toBe(false);
  });

  it('refuses a payload that carries a scheme or an invalid provider id', async () => {
    const { call } = register();

    const badDomain = (await call(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, {
      providerId: 'mangadex',
      domains: ['https://api.mangadex.org'],
    })) as { ok: boolean };
    const badId = (await call(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, {
      providerId: 'bad id',
      domains: ['api.mangadex.org'],
    })) as { ok: boolean };

    expect(badDomain.ok).toBe(false);
    expect(badId.ok).toBe(false);
  });

  it('refuses a registration from a frame that is not the app frame', async () => {
    const { allowlist, call } = register({ trusted: false });

    const result = (await call(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, {
      providerId: 'mangadex',
      domains: ['api.mangadex.org'],
    })) as { ok: boolean };

    expect(result.ok).toBe(false);
    expect(allowlist.size()).toBe(0);
  });
});
