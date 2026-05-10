import type { ProviderManifest } from './provider.js';

declare const extensionInstallIdBrand: unique symbol;
export type ExtensionInstallId = string & {
  readonly [extensionInstallIdBrand]: typeof extensionInstallIdBrand;
};

export function toExtensionInstallId(id: string): ExtensionInstallId {
  return id as ExtensionInstallId;
}

export type ExtensionInstallState =
  | 'pending'
  | 'installing'
  | 'installed'
  | 'disabled'
  | 'failed'
  | 'uninstalled';

export type ExtensionHealthStatus = 'ok' | 'degraded' | 'broken' | 'unknown';

export interface ExtensionInstallWarning {
  readonly code: string;
  readonly message: string;
  readonly severity?: 'info' | 'warning' | 'error';
}

export interface ExtensionRegistryEntry {
  readonly name: string;
  readonly registryUrl: string;
  readonly description?: string;
}

export interface ExtensionInstallMetadata {
  readonly id: ExtensionInstallId;
  readonly manifest: ProviderManifest;
  readonly sourceUrl: string;
  readonly registryUrl?: string;
  readonly checksum?: string;
  readonly installedVersion: string;
  readonly enabled: boolean;
  readonly installedAt: string;
  readonly updatedAt?: string;
  readonly state: ExtensionInstallState;
  readonly health: ExtensionHealthStatus;
  readonly warnings: readonly ExtensionInstallWarning[];
}
