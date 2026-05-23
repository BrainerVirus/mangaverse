import type { AppResult, ProviderManifest } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';

export interface ExtensionInstallPolicy {
  readonly runtime: 'web' | 'desktop' | 'mobile';
  readonly appVersion?: string;
}

export function validateManifestInstallPolicy(
  manifest: ProviderManifest,
  policy: ExtensionInstallPolicy,
): AppResult<void> {
  if (!manifest.compatibility.platforms.includes(policy.runtime)) {
    return err(
      createAppError({
        code: 'extensions.core.policy.runtime_mismatch',
        message: `Extension does not support '${policy.runtime}' platform. Supported platforms: ${manifest.compatibility.platforms.join(', ')}.`,
      }),
    );
  }

  if (policy.appVersion !== undefined) {
    const parsedPolicyVersion = parseVersion(policy.appVersion);
    if (parsedPolicyVersion === undefined) {
      return err(
        createAppError({
          code: 'extensions.core.policy.invalid_version',
          message: 'Compatibility version must use numeric dot-separated segments.',
        }),
      );
    }

    if (manifest.compatibility.minAppVersion !== undefined) {
      const parsedMin = parseVersion(manifest.compatibility.minAppVersion);
      if (parsedMin === undefined) {
        return err(
          createAppError({
            code: 'extensions.core.policy.invalid_version',
            message: 'Compatibility version must use numeric dot-separated segments.',
          }),
        );
      }
      if (compareVersions(parsedPolicyVersion, parsedMin) < 0) {
        return err(
          createAppError({
            code: 'extensions.core.policy.app_version_too_low',
            message: `App version ${policy.appVersion} is below required minimum ${manifest.compatibility.minAppVersion}.`,
          }),
        );
      }
    }

    if (manifest.compatibility.maxAppVersion !== undefined) {
      const parsedMax = parseVersion(manifest.compatibility.maxAppVersion);
      if (parsedMax === undefined) {
        return err(
          createAppError({
            code: 'extensions.core.policy.invalid_version',
            message: 'Compatibility version must use numeric dot-separated segments.',
          }),
        );
      }
      if (compareVersions(parsedPolicyVersion, parsedMax) > 0) {
        return err(
          createAppError({
            code: 'extensions.core.policy.app_version_too_high',
            message: `App version ${policy.appVersion} exceeds maximum supported ${manifest.compatibility.maxAppVersion}.`,
          }),
        );
      }
    }
  } else if (manifest.compatibility.minAppVersion !== undefined) {
    if (parseVersion(manifest.compatibility.minAppVersion) === undefined) {
      return err(
        createAppError({
          code: 'extensions.core.policy.invalid_version',
          message: 'Compatibility version must use numeric dot-separated segments.',
        }),
      );
    }
  } else if (manifest.compatibility.maxAppVersion !== undefined) {
    if (parseVersion(manifest.compatibility.maxAppVersion) === undefined) {
      return err(
        createAppError({
          code: 'extensions.core.policy.invalid_version',
          message: 'Compatibility version must use numeric dot-separated segments.',
        }),
      );
    }
  }

  return ok(undefined);
}

function parseVersion(version: string): readonly number[] | undefined {
  if (!/^\d+(?:\.\d+)*$/.test(version)) return undefined;
  return version.split('.').map((part) => Number(part));
}

function compareVersions(a: readonly number[], b: readonly number[]): number {
  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i++) {
    const partA = a[i] ?? 0;
    const partB = b[i] ?? 0;
    if (partA < partB) return -1;
    if (partA > partB) return 1;
  }

  return 0;
}
