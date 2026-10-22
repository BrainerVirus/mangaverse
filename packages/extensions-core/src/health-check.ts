import type { AppDrizzleDb } from '@app/db';
import { listInstalledExtensions, updateInstalledExtensionHealth } from '@app/db';
import type { ExtensionInstallMetadata } from '@app/shared';
import { validateProviderManifest } from '@app/shared';

import { recordExtensionLog, sanitizeLogMessage } from './extension-logs.js';

export type ProviderHealthCheckStatus = 'pass' | 'fail' | 'degraded' | 'skipped';

export interface ProviderHealthCheckItem {
  readonly id: string;
  readonly label: string;
  readonly status: ProviderHealthCheckStatus;
  readonly reason?: string;
}

export type ProviderHealthStatus = 'ok' | 'degraded' | 'broken';

export interface ProviderHealthCheckReport {
  readonly providerId: string;
  readonly checkedAt: string;
  readonly status: ProviderHealthStatus;
  readonly checks: readonly ProviderHealthCheckItem[];
  readonly networkChecked: boolean;
}

export interface ProviderHealthCheckDependencies {
  readonly db: AppDrizzleDb;
  /** Runs an existing capability's read call; never a new code path. */
  readonly networkProbe?: (signal: AbortSignal) => Promise<void>;
  readonly includeNetwork?: boolean;
  readonly signal?: AbortSignal;
  /** Whether the app has a registered runtime binding for this provider id. */
  readonly runtimeAvailable?: (providerId: string) => boolean;
  readonly now?: () => Date;
}

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Strict enough to compare safely; malformed versions are rejected, not
 * guessed. Build metadata is accepted and ignored, per semver.
 */
export function parseSemver(
  version: string,
): readonly [number, number, number, string | null] | null {
  const match = SEMVER.exec(version);
  if (match === null) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return null;
  }
  const prerelease = match[4] ?? null;
  if (prerelease !== null && prerelease.split('.').some((part) => /^0\d+$/.test(part))) {
    return null;
  }
  return [major, minor, patch, prerelease];
}

function comparePrerelease(left: string, right: string): number {
  const a = left.split('.');
  const b = right.split('.');
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const x = a[index];
    const y = b[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNumeric = /^\d+$/.test(x);
    const yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) {
      const delta = Number(x) - Number(y);
      if (delta !== 0) return delta;
    } else if (xNumeric) {
      return -1;
    } else if (yNumeric) {
      return 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** Positive when `left` is newer than `right`. */
export function compareSemver(left: string, right: string): number | null {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (a === null || b === null) return null;
  const coreDelta = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  if (coreDelta !== 0) return coreDelta;
  // A release outranks any prerelease of the same core version.
  if (a[3] === null && b[3] === null) return 0;
  if (a[3] === null) return 1;
  if (b[3] === null) return -1;
  return comparePrerelease(a[3], b[3]);
}

function isHttpUrl(value: string | undefined): boolean {
  if (value === undefined) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function check(
  id: string,
  label: string,
  status: ProviderHealthCheckStatus,
  reason?: string,
): ProviderHealthCheckItem {
  return { id, label, status, ...(reason !== undefined ? { reason } : {}) };
}

function capabilityCheck(manifest: ExtensionInstallMetadata['manifest']): ProviderHealthCheckItem {
  const enabled = Object.entries(manifest.capabilities).filter(([, value]) => value === true);
  if (enabled.length === 0) {
    return check(
      'capabilities',
      'Capabilities',
      'fail',
      'Manifest declares no enabled capability.',
    );
  }

  const details = manifest.capabilityDetails ?? [];
  const seen = new Set<string>();
  for (const detail of details) {
    if (seen.has(detail.key)) {
      return check(
        'capabilities',
        'Capabilities',
        'fail',
        `Duplicate capability details for ${detail.key}.`,
      );
    }
    seen.add(detail.key);
    if (!manifest.capabilities[detail.key]) {
      return check(
        'capabilities',
        'Capabilities',
        'fail',
        `Capability details declare ${detail.key}, which the manifest does not enable.`,
      );
    }
  }
  return check(
    'capabilities',
    'Capabilities',
    'pass',
    `${enabled.length} declared ${enabled.length === 1 ? 'capability' : 'capabilities'}.`,
  );
}

function updateHealth(
  db: AppDrizzleDb,
  metadata: ExtensionInstallMetadata,
  status: ProviderHealthStatus,
): Promise<void> {
  return updateInstalledExtensionHealth(db, String(metadata.id), status);
}

/**
 * Runs static install checks by default. Only when the caller opts into a
 * network probe does the provider's existing search run once. Structural
 * failures mark the metadata broken; a transient network failure only degrades
 * this report and is logged, never persisted as broken.
 */
export async function runProviderHealthCheck(
  providerId: string,
  deps: ProviderHealthCheckDependencies,
): Promise<ProviderHealthCheckReport> {
  const now = deps.now ?? (() => new Date());
  const checkedAt = now().toISOString();
  const checks: ProviderHealthCheckItem[] = [];

  const installed = await listInstalledExtensions(deps.db);
  const metadata = installed.find((entry) => String(entry.id) === providerId);
  if (metadata === undefined) {
    checks.push(check('installed', 'Install record', 'fail', 'Provider is not installed.'));
    return {
      providerId,
      checkedAt,
      status: 'broken',
      checks,
      networkChecked: false,
    };
  }
  checks.push(check('installed', 'Install record', 'pass'));

  const manifestResult = validateProviderManifest(metadata.manifest);
  if (!manifestResult.ok) {
    checks.push(
      check('manifest', 'Manifest', 'fail', sanitizeLogMessage(manifestResult.error.message)),
    );
  } else {
    checks.push(check('manifest', 'Manifest', 'pass'));
  }

  if (parseSemver(metadata.installedVersion) === null) {
    checks.push(check('version', 'Version', 'fail', 'Installed version is not valid semver.'));
  } else if (manifestResult.ok && metadata.installedVersion !== manifestResult.value.version) {
    checks.push(
      check('version', 'Version', 'fail', 'Installed version does not match the manifest version.'),
    );
  } else {
    checks.push(check('version', 'Version', 'pass', `v${metadata.installedVersion}`));
  }

  checks.push(
    isHttpUrl(metadata.sourceUrl)
      ? check('source-url', 'Source URL', 'pass')
      : check('source-url', 'Source URL', 'fail', 'Source URL must be an http(s) URL.'),
  );

  if (metadata.manifestUrl === undefined) {
    checks.push(
      check(
        'manifest-url',
        'Manifest URL',
        'skipped',
        'No manifest URL recorded; updates are unavailable.',
      ),
    );
  } else {
    checks.push(
      isHttpUrl(metadata.manifestUrl)
        ? check('manifest-url', 'Manifest URL', 'pass')
        : check('manifest-url', 'Manifest URL', 'fail', 'Manifest URL must be an http(s) URL.'),
    );
  }

  checks.push(
    metadata.enabled
      ? check('enabled', 'Enabled', 'pass')
      : check('enabled', 'Enabled', 'skipped', 'Provider is disabled; remote checks are skipped.'),
  );

  const runtimeAvailable = deps.runtimeAvailable?.(providerId);
  if (runtimeAvailable === undefined) {
    checks.push(
      check('runtime', 'Runtime binding', 'skipped', 'No runtime registry was supplied.'),
    );
  } else {
    checks.push(
      runtimeAvailable
        ? check('runtime', 'Runtime binding', 'pass')
        : check('runtime', 'Runtime binding', 'fail', 'No runtime binding is registered.'),
    );
  }

  checks.push(
    manifestResult.ok
      ? capabilityCheck(manifestResult.value)
      : check('capabilities', 'Capabilities', 'skipped', 'Manifest is invalid.'),
  );

  const structuralFailure = checks.some((item) => item.status === 'fail');
  const networkProbe = deps.networkProbe;
  const canProbe =
    deps.includeNetwork === true &&
    networkProbe !== undefined &&
    metadata.enabled &&
    runtimeAvailable !== false &&
    !structuralFailure;

  let networkChecked = false;
  if (deps.includeNetwork === true) {
    if (!canProbe) {
      checks.push(
        check(
          'network',
          'Network',
          'skipped',
          'Network check is unavailable while the provider is disabled or structurally broken.',
        ),
      );
    } else if (networkProbe !== undefined) {
      const controller = new AbortController();
      const forwardAbort = () => controller.abort();
      deps.signal?.addEventListener('abort', forwardAbort, { once: true });
      if (deps.signal?.aborted === true) controller.abort();
      networkChecked = true;
      try {
        await networkProbe(controller.signal);
        checks.push(check('network', 'Network', 'pass', 'Provider responded.'));
      } catch (error) {
        if (controller.signal.aborted) {
          checks.push(check('network', 'Network', 'degraded', 'Network check was cancelled.'));
        } else {
          const message = error instanceof Error ? error.message : 'Provider request failed.';
          checks.push(check('network', 'Network', 'degraded', sanitizeLogMessage(message)));
        }
      } finally {
        deps.signal?.removeEventListener('abort', forwardAbort);
      }
    }
  }

  const status: ProviderHealthStatus = structuralFailure
    ? 'broken'
    : checks.some((item) => item.status === 'degraded')
      ? 'degraded'
      : 'ok';

  // A structural pass always replaces a stale broken/unknown health, including
  // when only the optional network probe failed (degraded). Structural failures
  // remain broken until a later check actually passes.
  if (status === 'broken') {
    await updateHealth(deps.db, metadata, 'broken');
  } else if (metadata.health !== status) {
    await updateHealth(deps.db, metadata, status);
  }

  const passed = checks.filter((item) => item.status === 'pass').length;
  const failed = checks.filter((item) => item.status === 'fail').length;
  const degraded = checks.filter((item) => item.status === 'degraded').length;

  await recordExtensionLog(deps.db, {
    providerId,
    level: status === 'broken' ? 'error' : status === 'degraded' ? 'warn' : 'info',
    code: `extensions.health.${status}`,
    message: `Health check: ${passed} passed, ${failed} failed, ${degraded} degraded.`,
    details: { operation: 'health', checks: checks.length, version: metadata.installedVersion },
  });

  return { providerId, checkedAt, status, checks, networkChecked };
}
