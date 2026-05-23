export const PACKAGE_NAME = '@app/extensions-sdk' as const;

export type {
  ProviderAuthState,
  ProviderChapter,
  ProviderContext,
  ProviderContract,
  ProviderDetails,
  ProviderDownloadInfo,
  ProviderMethodName,
  ProviderPage,
  ProviderRequest,
  ProviderSearchInput,
  ProviderSearchResult,
  ProviderSearchResultItem,
  ProviderTag,
} from './contract-types.js';

export { assertProviderSupports, CAPABILITY_TO_PROVIDER_METHOD, getRequiredMethodsForCapabilities } from './capabilities.js';
export { defineProvider } from './define-provider.js';
export { validateProviderContract, providerMethodGuard } from './validate-contract.js';
export { createProviderRequestClient } from './request-client.js';
export type { ProviderRequestClient, ProviderRequestClientOptions, ProviderRequestResponse } from './request-client.js';
export { createRateLimiter } from './rate-limiter.js';
export type { RateLimiter, RateLimiterOptions } from './rate-limiter.js';
export { parseHtml, parseHtmlAttr, parseHtmlText, querySelectorAllNodes, resolveUrl } from './parse-html.js';
export type { ParsedHtmlRoot } from './parse-html.js';
export { normalizeProviderError, redactUrlForErrorDetails } from './errors.js';
export type { NormalizeProviderErrorContext } from './errors.js';
export { createMockProvider } from './mock-provider.js';
export type { CreateMockProviderOptions } from './mock-provider.js';
export { runProviderContractTests } from './contract-tests.js';
export type { ProviderContractTestResult } from './contract-tests.js';
export { validateRemoteManifestUrlForFetch } from './manifest-url.js';
