import type {
  CapabilityDisplayRow,
  PermissionDisplayRow,
  ProviderSettingsValues,
} from './core/index.js';
import type { ExtensionInstallMetadata, ExtensionRegistryEntry } from '@app/shared';

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
  readonly registries: readonly ExtensionRegistryEntry[];
}

export interface ProviderDetailData {
  readonly provider: ExtensionInstallMetadata;
  readonly capabilities: readonly CapabilityDisplayRow[];
  readonly permissions: readonly PermissionDisplayRow[];
  readonly settings: ProviderSettingsValues;
}
