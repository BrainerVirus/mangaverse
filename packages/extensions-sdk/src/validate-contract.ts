import type { AppResult } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';
import type { ProviderManifest } from '@app/shared';

import { assertProviderSupports, getRequiredMethodsForCapabilities } from './capabilities.js';
import type { ProviderContract, ProviderMethodName } from './contract-types.js';

export function validateProviderContract(manifest: ProviderManifest, provider: ProviderContract): AppResult<void> {
  if (provider.manifest.id !== manifest.id) {
    return err(
      createAppError({
        code: 'extensions.sdk.contract.mismatch',
        message: 'Provider manifest id does not match validation manifest.',
        providerId: manifest.id,
      }),
    );
  }

  const required = getRequiredMethodsForCapabilities(manifest);
  for (const method of required) {
    const fn = provider[method];
    if (typeof fn !== 'function') {
      return err(
        createAppError({
          code: 'extensions.sdk.contract.missing_method',
          message: `Provider is missing required method for declared capabilities: ${method}.`,
          providerId: manifest.id,
          details: { method },
        }),
      );
    }
  }

  return ok(undefined);
}

export function providerMethodGuard(
  manifest: ProviderManifest,
  provider: ProviderContract,
  method: ProviderMethodName,
): AppResult<NonNullable<ProviderContract[ProviderMethodName]>> {
  if (!assertProviderSupports(manifest, method)) {
    return err(
      createAppError({
        code: 'extensions.sdk.contract.capability_unavailable',
        message: `Manifest does not declare support for ${method}.`,
        providerId: manifest.id,
        details: { method },
      }),
    );
  }

  const fn = provider[method];
  if (typeof fn !== 'function') {
    return err(
      createAppError({
        code: 'extensions.sdk.contract.method_unavailable',
        message: `Provider does not implement ${method}.`,
        providerId: manifest.id,
        details: { method },
      }),
    );
  }
  return ok(fn as NonNullable<ProviderContract[ProviderMethodName]>);
}
