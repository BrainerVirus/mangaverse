import type { CapabilityDisplayRow, PermissionDisplayRow, ProviderSettingsValues } from '@app/extensions-core';
import type { ExtensionInstallMetadata } from '@app/shared';

export interface InstalledProviderSummary {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly health: ExtensionInstallMetadata['health'];
  readonly sourceUrl: string;
  readonly languages: readonly string[];
  readonly capabilityCount: number;
}

export interface ExtensionsPageData {
  readonly providers: readonly InstalledProviderSummary[];
}

export interface ProviderDetailData {
  readonly provider: ExtensionInstallMetadata;
  readonly capabilities: readonly CapabilityDisplayRow[];
  readonly permissions: readonly PermissionDisplayRow[];
  readonly settings: ProviderSettingsValues;
}
