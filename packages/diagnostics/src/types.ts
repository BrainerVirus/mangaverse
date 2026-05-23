import type {
  LocalServiceInfo,
  PlatformCapabilities,
  PlatformDiagnosticsSnapshot,
  PlatformStorageEstimate,
} from '@app/platform';

export interface LocalDataSummary {
  readonly libraryEntryCount: number;
  readonly mangaIdentityCount: number;
  readonly installedExtensionCount: number;
  readonly enabledExtensionCount: number;
  readonly brokenExtensionCount: number;
  readonly categoryCount: number;
  readonly providerSettingsCount: number;
}

export interface DiagnosticsReport {
  readonly generatedAt: string;
  readonly appName: string;
  readonly appVersion: string;
  readonly runtime: PlatformCapabilities['runtime'];
  readonly capabilities: PlatformCapabilities;
  readonly platformSnapshot: PlatformDiagnosticsSnapshot;
  readonly storageEstimate: PlatformStorageEstimate | null;
  readonly localService: LocalServiceInfo | null;
  readonly localData: LocalDataSummary | null;
  readonly localDatabaseReady: boolean;
}
