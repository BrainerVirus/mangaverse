import type { AppDrizzleDb } from '@app/db';
import { listInstalledExtensions } from '@app/db';
import type { AppResult, ProviderManifest } from '@app/shared';
import { createAppError, err } from '@app/shared';

import { recordExtensionLog, sanitizeLogMessage } from './extension-logs.js';
import { compareSemver } from './health-check.js';
import { fetchAndValidateManifestFromUrl } from './manifest-fetch.js';
import { updateInstalledProviderManifest } from './providers-ops.js';

export type ProviderUpdateStatus =
  | 'available'
  | 'up-to-date'
  | 'older'
  | 'no-manifest-url'
  | 'invalid'
  | 'network-error'
  | 'cancelled';

export interface ProviderUpdateCheck {
  readonly providerId: string;
  readonly status: ProviderUpdateStatus;
  readonly currentVersion: string;
  readonly checkedAt: string;
  readonly remoteVersion?: string;
  readonly message?: string;
  /** Present only when the remote manifest is valid and newer. */
  readonly remoteManifest?: ProviderManifest;
}

export interface ProviderUpdateDependencies {
  readonly db: AppDrizzleDb;
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
}

const NETWORK_CODES = new Set([
  'extensions.core.fetch.failed',
  'extensions.core.fetch.timeout',
  'extensions.core.fetch.http_error',
]);

/**
 * Checks the stored manifest URL through the same validated fetch path as an
 * install. Never executes provider code and never writes installation state.
 */
export async function checkProviderUpdate(
  providerId: string,
  deps: ProviderUpdateDependencies,
): Promise<ProviderUpdateCheck> {
  const checkedAt = (deps.now ?? (() => new Date()))().toISOString();
  const installed = await listInstalledExtensions(deps.db);
  const metadata = installed.find((entry) => String(entry.id) === providerId);

  const finish = async (
    status: ProviderUpdateStatus,
    extra: {
      readonly remoteVersion?: string;
      readonly message?: string;
      readonly remoteManifest?: ProviderManifest;
    } = {},
  ): Promise<ProviderUpdateCheck> => {
    if (status !== 'cancelled') {
      await recordExtensionLog(deps.db, {
        providerId,
        level:
          status === 'invalid'
            ? 'error'
            : status === 'network-error' || status === 'older' || status === 'no-manifest-url'
              ? 'warn'
              : 'info',
        code: `extensions.update_check.${status}`,
        message: extra.message ?? `Update check: ${status}.`,
        details: { operation: 'update-check', version: metadata?.installedVersion },
      });
    }
    return {
      providerId,
      status,
      currentVersion: metadata?.installedVersion ?? '',
      checkedAt,
      ...(extra.remoteVersion !== undefined ? { remoteVersion: extra.remoteVersion } : {}),
      ...(extra.message !== undefined ? { message: extra.message } : {}),
      ...(extra.remoteManifest !== undefined ? { remoteManifest: extra.remoteManifest } : {}),
    };
  };

  if (metadata === undefined) {
    return finish('invalid', { message: 'Provider is not installed.' });
  }

  if (metadata.manifestUrl === undefined) {
    return finish('no-manifest-url', {
      message: 'No manifest URL is recorded for this provider, so updates cannot be checked.',
    });
  }

  const fetched = await fetchAndValidateManifestFromUrl(metadata.manifestUrl, {
    fetch: deps.fetch,
    ...(deps.signal !== undefined ? { signal: deps.signal } : {}),
    ...(deps.timeoutMs !== undefined ? { timeoutMs: deps.timeoutMs } : {}),
  });

  if (!fetched.ok) {
    if (fetched.error.code === 'extensions.core.fetch.aborted') {
      return finish('cancelled');
    }
    if (NETWORK_CODES.has(fetched.error.code)) {
      return finish('network-error', {
        message: sanitizeLogMessage(fetched.error.message),
      });
    }
    return finish('invalid', { message: sanitizeLogMessage(fetched.error.message) });
  }

  const remote = fetched.value;
  if (String(remote.id) !== String(metadata.id)) {
    return finish('invalid', {
      message: 'Remote manifest belongs to a different provider.',
      remoteVersion: remote.version,
    });
  }

  const comparison = compareSemver(remote.version, metadata.installedVersion);
  if (comparison === null) {
    return finish('invalid', {
      message: 'Remote manifest version is not valid semver.',
      remoteVersion: remote.version,
    });
  }

  if (comparison > 0) {
    return finish('available', {
      remoteVersion: remote.version,
      message: `Update available: v${remote.version}.`,
      remoteManifest: remote,
    });
  }
  if (comparison < 0) {
    return finish('older', {
      remoteVersion: remote.version,
      message: `Remote version v${remote.version} is older than installed v${metadata.installedVersion}.`,
    });
  }
  return finish('up-to-date', {
    remoteVersion: remote.version,
    message: `Provider is up to date at v${remote.version}.`,
  });
}

/**
 * Applies an already validated, confirmed remote manifest through the existing
 * update op. Enabled state, settings and uninstall behavior are untouched.
 */
export async function applyProviderUpdate(
  providerId: string,
  remoteManifest: ProviderManifest,
  deps: { readonly db: AppDrizzleDb },
): Promise<AppResult<void>> {
  const installed = await listInstalledExtensions(deps.db);
  const metadata = installed.find((entry) => String(entry.id) === providerId);
  if (metadata === undefined) {
    return err(
      createAppError({
        code: 'extensions.update.not_installed',
        message: 'Provider is not installed.',
      }),
    );
  }

  const comparison = compareSemver(remoteManifest.version, metadata.installedVersion);
  if (comparison === null || comparison <= 0) {
    return err(
      createAppError({
        code: 'extensions.update.not_newer',
        message: 'Remote manifest is not a newer valid version.',
        details: {
          installedVersion: metadata.installedVersion,
          remoteVersion: remoteManifest.version,
        },
      }),
    );
  }

  return updateInstalledProviderManifest(providerId, remoteManifest, deps);
}
