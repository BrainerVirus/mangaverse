import type { ProviderManifest } from '@app/shared';
import { toProviderMangaId } from '@app/shared';

import { getRequiredMethodsForCapabilities } from './capabilities.js';
import type { ProviderContext, ProviderContract, ProviderMethodName, ProviderSearchInput } from './contract-types.js';
import { providerMethodGuard, validateProviderContract } from './validate-contract.js';

export interface ProviderContractTestResult {
  readonly ok: boolean;
  readonly failures: readonly {
    readonly method?: ProviderMethodName;
    readonly code: string;
    readonly message: string;
  }[];
}

const SEARCH_FIXTURE: ProviderSearchInput = { query: 'test', page: 1, limit: 10 };

function buildContext(manifest: ProviderManifest): ProviderContext {
  return { manifest, providerId: String(manifest.id) };
}

async function invokeRequiredMethod(
  manifest: ProviderManifest,
  provider: ProviderContract,
  method: ProviderMethodName,
): Promise<void> {
  const ctx = buildContext(manifest);
  const guard = providerMethodGuard(manifest, provider, method);
  if (!guard.ok) {
    throw new Error(guard.error.message);
  }

  const mangaId = toProviderMangaId('contract-test-manga');

  switch (method) {
    case 'search':
      await provider.search!(ctx, SEARCH_FIXTURE);
      return;
    case 'advancedSearch':
      await provider.advancedSearch!(ctx, { ...SEARCH_FIXTURE });
      return;
    case 'browseLatest':
      await provider.browseLatest!(ctx, { page: 1 });
      return;
    case 'browsePopular':
      await provider.browsePopular!(ctx, { page: 1 });
      return;
    case 'getDetails':
      await provider.getDetails!(ctx, mangaId);
      return;
    case 'getChapters':
      await provider.getChapters!(ctx, mangaId);
      return;
    case 'getPages':
      await provider.getPages!(ctx, mangaId, 'chapter-1');
      return;
    case 'getRecommendations':
      await provider.getRecommendations!(ctx, mangaId);
      return;
    case 'getRelatedTitles':
      await provider.getRelatedTitles!(ctx, mangaId);
      return;
    case 'getTags':
      await provider.getTags!(ctx);
      return;
    case 'login':
      await provider.login!(ctx, {});
      return;
    case 'logout':
      await provider.logout!(ctx);
      return;
    case 'getDownloadInfo':
      await provider.getDownloadInfo!(ctx, mangaId, 'chapter-1');
      return;
    default:
      return;
  }
}

export async function runProviderContractTests(options: {
  readonly manifest: ProviderManifest;
  readonly provider: ProviderContract;
}): Promise<ProviderContractTestResult> {
  const res = validateProviderContract(options.manifest, options.provider);
  if (!res.ok) {
    const methodRaw = res.error.details?.method;
    const method = typeof methodRaw === 'string' ? (methodRaw as ProviderMethodName) : undefined;
    return {
      ok: false,
      failures: [
        method !== undefined
          ? { method, code: res.error.code, message: res.error.message }
          : { code: res.error.code, message: res.error.message },
      ],
    };
  }

  const failures: Array<{ method?: ProviderMethodName; code: string; message: string }> = [];
  const required = getRequiredMethodsForCapabilities(options.manifest);

  let chain: Promise<void> = Promise.resolve();
  for (const method of required) {
    chain = chain.then(async () => {
      try {
        await invokeRequiredMethod(options.manifest, options.provider, method);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        failures.push({
          method,
          code: 'extensions.sdk.contract.runtime_error',
          message,
        });
      }
    });
  }
  await chain;

  return failures.length === 0 ? { ok: true, failures: [] } : { ok: false, failures };
}
