export const PACKAGE_NAME = '@app/extensions-core' as const;

export type {
  ExtensionInstallAction,
  ExtensionInstallPreview,
  ExtensionInstallReducer,
  ExtensionInstallSession,
  ExtensionInstallSource,
  ExtensionInstallStep,
} from './install-types.js';
export { buildInstallPreview, createExtensionInstallSession, transitionExtensionInstall } from './install-session.js';
export { fetchAndValidateManifestFromUrl, fetchManifestFromUrl } from './manifest-fetch.js';
export type { ExtensionFetchEnvironment } from './manifest-fetch.js';
export {
  prepareManualExtensionInstall,
  prepareProtocolExtensionInstall,
  prepareRegistryExtensionInstall,
} from './prepare-install.js';
export type { RegistryProviderEntry } from './prepare-install.js';
export type { ExtensionInstallPolicy } from './install-policy.js';
export { validateManifestInstallPolicy } from './install-policy.js';
export { confirmExtensionInstall } from './confirm-install.js';
export type { ExtensionCoreDependencies } from './confirm-install.js';
export { importExtensionRegistry } from './registry-import.js';
export type { ExtensionRegistryImportDocument, ExtensionRegistryImportResult } from './registry-import.js';
export {
  disableInstalledProvider,
  enableInstalledProvider,
  listInstalledProviders,
  markProviderBroken,
  uninstallInstalledProvider,
  updateInstalledProviderManifest,
} from './providers-ops.js';
export { getProviderSettings, saveProviderSettings } from './settings-persistence.js';
export type { ExtensionSettingsDependencies } from './settings-persistence.js';
export { buildCapabilityDisplay, buildPermissionDisplay } from './display.js';
export type { CapabilityDisplayRow, PermissionDisplayRow } from './display.js';
export { validateProviderSettings } from './settings.js';
export type { ProviderSettingsValues } from './settings.js';
