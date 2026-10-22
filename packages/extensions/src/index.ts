export { ExtensionsPage, type ExtensionsPageProps } from './components/ExtensionsPage.js';
export {
  ProviderDetailPage,
  type ProviderDetailPageProps,
} from './components/ProviderDetailPage.js';
export {
  ProviderSettingsForm,
  type ProviderSettingsFormProps,
} from './components/ProviderSettingsForm.js';
export {
  RegistryImportDialog,
  type RegistryImportDialogProps,
} from './components/RegistryImportDialog.js';
export {
  InstallProviderDialog,
  type InstallProviderDialogProps,
} from './components/InstallProviderDialog.js';
export { fetchExtensionsPage, demoInstallMetadata } from './fetch-extensions-page.js';
export { fetchProviderDetail } from './fetch-provider-detail.js';
export {
  applyExplicitContentGate,
  loadProviderSettings,
  updateProviderSettings,
} from './provider-settings.js';
export {
  draftFromSettings,
  emptyProviderSettingsDraft,
  hasEditableProviderSettings,
  providerSettingsSupport,
  settingsFromDraft,
} from './settings-draft.js';
export type { ProviderSettingsDraft, ProviderSettingsSupportView } from './settings-draft.js';
export { setProviderEnabled, removeProvider } from './provider-actions.js';
export {
  confirmProviderInstall,
  createExtensionInstallSession,
  prepareManualProviderInstall,
  transitionExtensionInstall,
} from './install-provider.js';
export type { ExtensionInstallSession } from './install-provider.js';
export { extensionsQueryKeys } from './query-keys.js';
export type { ExtensionsPageData, InstalledProviderSummary, ProviderDetailData } from './types.js';
export {
  exportExtensionRegistryData,
  fetchExtensionRegistryDocumentFromUrl,
  importExtensionRegistry,
  parseExtensionRegistryDocument,
} from '@app/extensions-core';
export type { ExtensionRegistryExport, ExtensionRegistryImportResult } from '@app/extensions-core';
