import { err, ok, type AppResult } from '@app/shared';
import type { IpcMain, IpcMainInvokeEvent, WebFrameMain } from 'electron';
import {
  PLATFORM_IPC,
  platformInvalidUrl,
  platformUnexpected,
  platformIpcRequestSchema,
  type PlatformIpcRequest,
} from '@app/platform';
import type { ProviderAllowlist } from './provider-allowlist.js';
import { toIpcAppResult } from './platform-ipc.js';

export const PROVIDER_NETWORK_CHANNELS = [
  PLATFORM_IPC.PROVIDER_NETWORK_REGISTER,
  PLATFORM_IPC.PROVIDER_NETWORK_UNREGISTER,
] as const;

type ProviderNetworkChannel = (typeof PROVIDER_NETWORK_CHANNELS)[number];

type ArgsOf<C extends ProviderNetworkChannel> = Extract<PlatformIpcRequest, { channel: C }>['args'];

export interface ProviderNetworkIpcDeps {
  readonly ipcMain: Pick<IpcMain, 'handle'>;
  readonly allowlist: ProviderAllowlist;
  readonly isTrustedFrame: (frame: WebFrameMain | null) => frame is WebFrameMain;
}

/**
 * The renderer's only way to change main's provider allowlist. Each call is
 * validated against the shared schema and authorized by its sender frame, so a
 * frame that is not the app's own cannot widen a provider's reach. Uninstalling a
 * provider removes its patterns; an empty registration denies every host.
 */
export function registerProviderNetworkIpc(deps: ProviderNetworkIpcDeps): void {
  function handle<C extends ProviderNetworkChannel>(
    channel: C,
    handler: (args: ArgsOf<C>) => AppResult<unknown>,
  ): void {
    deps.ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...rawArgs: unknown[]) => {
      if (!deps.isTrustedFrame(event.senderFrame)) {
        return toIpcAppResult(
          err(platformInvalidUrl('This frame may not change the provider network allowlist.')),
        );
      }
      const parsed = platformIpcRequestSchema.safeParse({ channel, args: rawArgs });
      if (!parsed.success) {
        return toIpcAppResult(err(platformInvalidUrl('IPC request payload is invalid.')));
      }
      try {
        return toIpcAppResult(handler(parsed.data.args as ArgsOf<C>));
      } catch (e) {
        return toIpcAppResult(err(platformUnexpected('Provider network call failed.', e)));
      }
    });
  }

  handle(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, ([registration]) => {
    deps.allowlist.register(registration.providerId, registration.domains);
    return ok(undefined);
  });

  handle(PLATFORM_IPC.PROVIDER_NETWORK_UNREGISTER, ([providerId]) => {
    deps.allowlist.unregister(providerId);
    return ok(undefined);
  });
}
