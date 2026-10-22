import type { AppDrizzleDb } from '@app/db/browser';
import { listInstalledExtensions } from '@app/db/browser';
import { loadProviderSettings } from '@app/extensions';
import type { LibraryUpdateProvider, LibraryUpdateProviderResolver } from '@app/library';
import {
  hasProviderCapability,
  toProviderMangaId,
  type ExtensionInstallMetadata,
  type ProviderManifest,
} from '@app/shared';
import { getProviderBinding } from './provider-registry.js';

/** The provider's declared chapter-call budget, then its network budget, then a calm default. */
function chapterRequestsPerMinute(manifest: ProviderManifest): number {
  const chapters = manifest.capabilityDetails?.find(
    (detail) => detail.key === 'metadata.chapters',
  )?.rateLimitRpm;
  const network = manifest.capabilityDetails?.find(
    (detail) => detail.key === 'ops.officialApi',
  )?.rateLimitRpm;
  return chapters ?? network ?? 60;
}

/**
 * Wires the library update queue to installed providers. Availability is
 * decided here — not installed, disabled, no chapter capability, no runtime —
 * so the queue only reports a reason and never calls a provider it must skip.
 */
export function createLibraryUpdateProviderResolver(
  db: AppDrizzleDb,
): LibraryUpdateProviderResolver {
  let installedOnce: Promise<ExtensionInstallMetadata[]> | undefined;
  const installed = () => (installedOnce ??= listInstalledExtensions(db));

  return async (providerId) => {
    const entry = (await installed()).find(
      (candidate) => String(candidate.manifest.id) === String(providerId),
    );
    if (entry === undefined) {
      return { status: 'unavailable', reason: 'Provider is not installed.' };
    }
    if (!entry.enabled) {
      return { status: 'unavailable', reason: 'Provider is disabled.' };
    }
    if (!hasProviderCapability(entry.manifest, 'metadata.chapters')) {
      return { status: 'unavailable', reason: 'Provider does not expose chapter lists.' };
    }

    const binding = getProviderBinding(String(providerId));
    if (binding === null) {
      return { status: 'unavailable', reason: 'Provider runtime is not available.' };
    }
    const provider = binding.createProvider();
    const getChapters = provider.getChapters;
    if (getChapters === undefined) {
      return { status: 'unavailable', reason: 'Provider does not expose chapter lists.' };
    }

    const settings = await loadProviderSettings(db, String(providerId));
    const rpm = settings.rateLimitOverrideRpm ?? chapterRequestsPerMinute(entry.manifest);
    if (!(rpm > 0)) {
      return { status: 'unavailable', reason: 'Provider rate limit is set to zero.' };
    }

    const updateProvider: LibraryUpdateProvider = {
      requestIntervalMs: Math.ceil(60_000 / rpm),
      listChapters: async (providerMangaId, { signal }) => {
        const chapters = await getChapters(
          {
            manifest: entry.manifest,
            providerId: String(providerId),
            settings,
            signal,
          },
          toProviderMangaId(providerMangaId),
        );
        return chapters.map((chapter) => ({
          id: chapter.id,
          title: chapter.title,
          index: chapter.index,
          ...(chapter.publishedAt === undefined ? {} : { publishedAt: chapter.publishedAt }),
        }));
      },
    };
    return { status: 'available', provider: updateProvider };
  };
}
