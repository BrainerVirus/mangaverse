import { err, ok, type AppResult } from '@app/shared';
import type { IpcMain, IpcMainInvokeEvent, WebFrameMain } from 'electron';
import {
  isStorageFullFailure,
  PLATFORM_IPC,
  platformInvalidUrl,
  platformStorageFull,
  platformUnexpected,
  platformIpcRequestSchema,
  type PlatformIpcRequest,
  type PlatformProviderResponse,
} from '@app/platform';
import {
  fetchMainProcessBytes,
  fetchNetworkResponse,
  NetworkFetchError,
  REQUEST_TIMEOUT_MS,
  withRefusalLog,
  type NetworkTransportDeps,
} from './main-process-fetch.js';
import type { PageStore } from './page-store.js';
import { pageMimeType } from './page-store.js';
import type { ProviderAllowlist } from './provider-allowlist.js';
import { networkErrorToAppError, toIpcAppResult } from './platform-ipc.js';

export const PROVIDER_NETWORK_CHANNELS = [
  PLATFORM_IPC.PROVIDER_NETWORK_REPLACE,
  PLATFORM_IPC.PROVIDER_NETWORK_REVOKE,
  PLATFORM_IPC.PROVIDER_NETWORK_NEXT_REVISION,
  PLATFORM_IPC.PROVIDER_NETWORK_REQUEST,
  PLATFORM_IPC.PROVIDER_NETWORK_STORE,
  PLATFORM_IPC.PROVIDER_NETWORK_STORE_USER_INITIATED,
] as const;

/** Response headers a provider client may see; everything else stays in main. */
const PROVIDER_RESPONSE_HEADERS = new Set([
  'content-type',
  'content-length',
  'etag',
  'last-modified',
  'cache-control',
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-ratelimit-retry-after',
]);

function filterProviderResponseHeaders(
  headers: Readonly<Record<string, string | string[]>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!PROVIDER_RESPONSE_HEADERS.has(name)) continue;
    out[name] = Array.isArray(value) ? (value[0] ?? '') : value;
  }
  return out;
}

type ProviderNetworkChannel = (typeof PROVIDER_NETWORK_CHANNELS)[number];

type ArgsOf<C extends ProviderNetworkChannel> = Extract<PlatformIpcRequest, { channel: C }>['args'];

export interface ProviderNetworkIpcDeps {
  readonly ipcMain: Pick<IpcMain, 'handle'>;
  readonly allowlist: ProviderAllowlist;
  readonly isTrustedFrame: (frame: WebFrameMain | null) => frame is WebFrameMain;
  readonly networkTransport: NetworkTransportDeps;
  readonly pageStore: PageStore;
}

/**
 * The renderer's only way to change main's provider allowlist. Each call is
 * validated against the shared schema and authorized by its sender frame, so a
 * frame that is not the app's own cannot widen a provider's reach. Disable and
 * uninstall revoke the provider directly; an empty registration denies every host.
 */
export function registerProviderNetworkIpc(deps: ProviderNetworkIpcDeps): void {
  function handle<C extends ProviderNetworkChannel>(
    channel: C,
    handler: (args: ArgsOf<C>) => AppResult<unknown> | Promise<AppResult<unknown>>,
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
      return Promise.resolve()
        .then(() => handler(parsed.data.args as ArgsOf<C>))
        .then(toIpcAppResult, (e: unknown) =>
          toIpcAppResult(
            err(
              isStorageFullFailure(e)
                ? platformStorageFull('This device is out of storage.', e)
                : platformUnexpected('Provider network call failed.', e),
            ),
          ),
        );
    });
  }

  // Main is authoritative: the renderer sends its complete enabled-provider table
  // and main makes that the whole map, dropping ids the snapshot omits. A revision
  // orders overlapping syncs so an older, slower snapshot can never re-register a
  // provider that a newer one disabled. A revoke raises a fence that every later
  // snapshot must exceed, so a replace taken at the same revision as (or before)
  // a revoke cannot restore access.
  let lastRevision = -1;
  let revokedThrough = -1;
  handle(PLATFORM_IPC.PROVIDER_NETWORK_REPLACE, ([snapshot]) => {
    // Equal is accepted only above the revoke fence: after a renderer reload the
    // revision clock may land on the same millisecond, but never above a revoke.
    if (snapshot.revision <= revokedThrough || snapshot.revision < lastRevision) {
      // Never report success for a snapshot main refused: the caller would think
      // the provider is enabled while main keeps it denied.
      return err(platformUnexpected('The provider network snapshot is stale; retry the sync.'));
    }
    deps.allowlist.replaceAll(snapshot.providers);
    lastRevision = snapshot.revision;
    return ok(undefined);
  });

  // A revoke is never stale: removing access is always safe, so it applies even
  // when its revision is older. It also raises the fence to the newest revision
  // seen, so a snapshot taken at the same or an older revision — including one
  // still in flight when the revoke arrives — cannot restore access. Re-enabling
  // must use a strictly newer revision.
  handle(PLATFORM_IPC.PROVIDER_NETWORK_REVOKE, ([request]) => {
    deps.allowlist.revoke(request.providerId);
    revokedThrough = Math.max(revokedThrough, lastRevision, request.revision);
    lastRevision = Math.max(lastRevision, revokedThrough);
    return ok(undefined);
  });

  // Main assigns the revision so a renderer reload (or a backward clock) cannot
  // reuse a revision already fenced by a revoke.
  let revisionClock = Date.now();
  handle(PLATFORM_IPC.PROVIDER_NETWORK_NEXT_REVISION, () => {
    revisionClock = Math.max(revisionClock + 1, Date.now());
    return ok(revisionClock);
  });

  handle(PLATFORM_IPC.PROVIDER_NETWORK_REQUEST, async ([request]) => {
    const timeoutMs = Math.min(request.timeoutMs ?? REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS);
    const deadline = Date.now() + timeoutMs;
    return withRefusalLog(deps.networkTransport, async () => {
      // The provider id selects the allowlist, and the same check runs before
      // every redirect hop inside the transport.
      if (!deps.allowlist.allowsUrl(request.providerId, request.url)) {
        throw new NetworkFetchError('network.blocked-url', 'Provider may not reach this host.', {
          url: request.url,
        });
      }
      return fetchNetworkResponse(
        request.url,
        async (url) => deps.allowlist.allowsUrl(request.providerId, url),
        deps.networkTransport,
        deadline,
        {
          ...(request.method !== undefined ? { method: request.method } : {}),
          ...(request.headers !== undefined ? { headers: request.headers } : {}),
          ...(request.body !== undefined ? { body: request.body } : {}),
        },
      );
    }).then(
      (response): AppResult<unknown> => {
        const value: PlatformProviderResponse = {
          status: response.status,
          headers: filterProviderResponseHeaders(response.headers),
          bodyText: new TextDecoder().decode(response.body),
          finalUrl: response.finalUrl,
        };
        return ok(value);
      },
      (e: unknown) => err(networkErrorToAppError(e)),
    );
  });

  handle(PLATFORM_IPC.PROVIDER_NETWORK_STORE, async ([request]) => {
    const deadline = Date.now() + REQUEST_TIMEOUT_MS;
    return withRefusalLog(deps.networkTransport, () =>
      fetchMainProcessBytes(
        request.url,
        async (url) => deps.allowlist.allowsUrl(request.providerId, url),
        deps.networkTransport,
        deadline,
      ),
    ).then(
      (fetched) => storeFetched(fetched, request.key),
      (e: unknown) => err(networkErrorToAppError(e)),
    );
  });

  // Custom covers are user-supplied: there is no manifest to authorize the host.
  // The inverse rule applies instead: no hop, first or redirected, may land on a
  // host a registered provider declares, so this channel cannot reach provider
  // APIs outside that provider's own allowlisted path. The URL, every resolved
  // address and every redirect are still validated, and size/time limits hold.
  handle(PLATFORM_IPC.PROVIDER_NETWORK_STORE_USER_INITIATED, async ([request]) => {
    const deadline = Date.now() + REQUEST_TIMEOUT_MS;
    return withRefusalLog(deps.networkTransport, async () => {
      if (deps.allowlist.claimedByAnyProvider(request.url)) {
        throw new NetworkFetchError(
          'network.blocked-url',
          'A custom cover may not come from a provider host.',
          { url: request.url },
        );
      }
      return fetchMainProcessBytes(
        request.url,
        async (url) => !deps.allowlist.claimedByAnyProvider(url),
        deps.networkTransport,
        deadline,
      );
    }).then(
      (fetched) => storeFetched(fetched, request.key),
      (e: unknown) => err(networkErrorToAppError(e)),
    );
  });

  async function storeFetched(
    fetched: { readonly data: ArrayBuffer; readonly mimeType: string },
    key: string,
  ): Promise<AppResult<unknown>> {
    const bytes = new Uint8Array(fetched.data);
    // Main writes the page; the renderer only learns the URL and size.
    const url = await deps.pageStore.put(key, bytes, fetched.mimeType);
    return ok({
      url,
      mimeType: pageMimeType(fetched.mimeType, bytes) ?? fetched.mimeType,
      byteSize: bytes.byteLength,
    });
  }
}
