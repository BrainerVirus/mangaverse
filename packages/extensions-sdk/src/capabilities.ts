import type { ProviderCapabilityKey, ProviderManifest } from '@app/shared';
import { hasProviderCapability } from '@app/shared';

import type { ProviderMethodName } from './contract-types.js';

/** Maps each capability flag to the provider method that must exist when the flag is true. */
export const CAPABILITY_TO_PROVIDER_METHOD: Readonly<
  Partial<Record<ProviderCapabilityKey, ProviderMethodName>>
> = {
  'discovery.search': 'search',
  'discovery.advancedSearch': 'advancedSearch',
  'discovery.latest': 'browseLatest',
  'discovery.popular': 'browsePopular',
  'metadata.details': 'getDetails',
  'metadata.chapters': 'getChapters',
  'metadata.pages': 'getPages',
  'metadata.recommendations': 'getRecommendations',
  'metadata.relatedTitles': 'getRelatedTitles',
  'metadata.tags': 'getTags',
  'auth.login': 'login',
  'auth.logout': 'logout',
};

const DOWNLOAD_METHOD: ProviderMethodName = 'getDownloadInfo';

/**
 * Provider methods that must be implemented for the capabilities declared true on the manifest.
 */
export function getRequiredMethodsForCapabilities(manifest: ProviderManifest): readonly ProviderMethodName[] {
  const required = new Set<ProviderMethodName>();
  for (const key of Object.keys(manifest.capabilities) as ProviderCapabilityKey[]) {
    if (manifest.capabilities[key] !== true) continue;
    const method = CAPABILITY_TO_PROVIDER_METHOD[key];
    if (method) required.add(method);
  }
  if (manifest.capabilities['download.chapters'] === true || manifest.capabilities['download.pages'] === true) {
    required.add(DOWNLOAD_METHOD);
  }
  return [...required];
}

const METHOD_PRIMARY_CAPABILITY: Readonly<Partial<Record<ProviderMethodName, ProviderCapabilityKey>>> = {
  search: 'discovery.search',
  advancedSearch: 'discovery.advancedSearch',
  browseLatest: 'discovery.latest',
  browsePopular: 'discovery.popular',
  getDetails: 'metadata.details',
  getChapters: 'metadata.chapters',
  getPages: 'metadata.pages',
  getRecommendations: 'metadata.recommendations',
  getRelatedTitles: 'metadata.relatedTitles',
  getTags: 'metadata.tags',
  login: 'auth.login',
  logout: 'auth.logout',
};

/**
 * Returns whether the manifest declares support needed to call `method` on a provider.
 */
export function assertProviderSupports(
  manifest: ProviderManifest,
  method: ProviderMethodName,
): boolean {
  if (method === DOWNLOAD_METHOD) {
    return (
      hasProviderCapability(manifest, 'download.chapters') || hasProviderCapability(manifest, 'download.pages')
    );
  }
  const cap = METHOD_PRIMARY_CAPABILITY[method];
  return cap !== undefined && hasProviderCapability(manifest, cap);
}
