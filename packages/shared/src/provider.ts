import type { AppResult } from './result.js';
import { createAppError, err, ok } from './result.js';
import type { ProviderId } from './manga.js';
import { toProviderId } from './manga.js';

export type ProviderPermission =
  | 'network.http'
  | 'network.websocket'
  | 'storage.local'
  | 'storage.read'
  | 'storage.write';

export interface ProviderCompatibility {
  readonly minAppVersion?: string;
  readonly maxAppVersion?: string;
  readonly platforms: readonly ('web' | 'desktop' | 'mobile')[];
}

export type ProviderCapabilityKey =
  /** Discovery */
  | 'discovery.search'
  | 'discovery.advancedSearch'
  | 'discovery.latest'
  | 'discovery.popular'
  | 'discovery.browse'
  /** Metadata */
  | 'metadata.details'
  | 'metadata.chapters'
  | 'metadata.pages'
  | 'metadata.recommendations'
  | 'metadata.relatedTitles'
  | 'metadata.tags'
  | 'metadata.languages'
  /** Auth */
  | 'auth.login'
  | 'auth.logout'
  | 'auth.library'
  /** Content */
  | 'content.nsfw'
  | 'content.ratingFilter'
  | 'content.tagFilter'
  /** Download */
  | 'download.chapters'
  | 'download.pages'
  /** Tracking */
  | 'tracking.sync'
  | 'tracking.link'
  /** Operational */
  | 'ops.officialApi'
  | 'ops.scraping'
  | 'ops.antiBot';

/**
 * Structured capability flags (single object, not ad-hoc booleans on the manifest).
 */
export type ProviderCapabilityMap = Partial<Record<ProviderCapabilityKey, boolean>>;

/** Describes capability-level constraints (rate limits, availability, known restrictions). */
export interface ProviderCapabilityDetail {
  readonly key: ProviderCapabilityKey;
  readonly supported: boolean;
  readonly rateLimitRpm?: number;
  readonly requiresAuth?: boolean;
  readonly knownRestrictions?: string[];
}

export interface ProviderContentFlags {
  readonly nsfw: boolean;
  readonly suggestive: boolean;
  readonly violence: boolean;
}

export interface ProviderSourceInfo {
  readonly url: string;
  readonly homepageUrl?: string;
  readonly manifestUrl?: string;
  readonly publisher?: string;
}

export interface ProviderManifest {
  readonly id: ProviderId;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly source: ProviderSourceInfo;
  readonly compatibility: ProviderCompatibility;
  readonly capabilities: ProviderCapabilityMap;
  readonly capabilityDetails?: readonly ProviderCapabilityDetail[];
  readonly permissions: readonly ProviderPermission[];
  readonly languages: readonly string[];
  readonly contentFlags: ProviderContentFlags;
  readonly checksum?: string;
  readonly signature?: string;
}

export function hasProviderCapability(
  manifest: ProviderManifest,
  capability: ProviderCapabilityKey,
): boolean {
  return manifest.capabilities[capability] === true;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isHttpUrl(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  try {
    const parsed = new URL(v);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const CAPABILITY_KEYS: readonly ProviderCapabilityKey[] = [
  'discovery.search',
  'discovery.advancedSearch',
  'discovery.latest',
  'discovery.popular',
  'discovery.browse',
  'metadata.details',
  'metadata.chapters',
  'metadata.pages',
  'metadata.recommendations',
  'metadata.relatedTitles',
  'metadata.tags',
  'metadata.languages',
  'auth.login',
  'auth.logout',
  'auth.library',
  'content.nsfw',
  'content.ratingFilter',
  'content.tagFilter',
  'download.chapters',
  'download.pages',
  'tracking.sync',
  'tracking.link',
  'ops.officialApi',
  'ops.scraping',
  'ops.antiBot',
] as const;

function isValidCapabilityMap(v: unknown): v is ProviderCapabilityMap {
  if (!isPlainObject(v)) return false;
  for (const key of Object.keys(v)) {
    if (!CAPABILITY_KEYS.includes(key as ProviderCapabilityKey)) return false;
    if (typeof v[key] !== 'boolean') return false;
  }
  return Object.keys(v).length > 0;
}

function validateCapabilityDetails(input: unknown): AppResult<readonly ProviderCapabilityDetail[] | undefined> {
  if (input === undefined) return ok(undefined);
  if (!Array.isArray(input)) {
    return err(createAppError({ code: 'provider.manifest.invalid', message: 'Manifest capabilityDetails must be an array.' }));
  }

  const details: ProviderCapabilityDetail[] = [];
  for (const item of input) {
    if (!isPlainObject(item)) {
      return err(createAppError({ code: 'provider.manifest.invalid', message: 'Each capability detail must be an object.' }));
    }
    const key = item['key'];
    if (typeof key !== 'string' || !CAPABILITY_KEYS.includes(key as ProviderCapabilityKey)) {
      return err(createAppError({ code: 'provider.manifest.invalid', message: 'Capability detail key is invalid.' }));
    }
    if (typeof item['supported'] !== 'boolean') {
      return err(createAppError({ code: 'provider.manifest.invalid', message: 'Capability detail supported must be boolean.' }));
    }
    if (item['rateLimitRpm'] !== undefined && (typeof item['rateLimitRpm'] !== 'number' || item['rateLimitRpm'] < 0)) {
      return err(createAppError({ code: 'provider.manifest.invalid', message: 'Capability detail rateLimitRpm must be non-negative.' }));
    }
    if (item['requiresAuth'] !== undefined && typeof item['requiresAuth'] !== 'boolean') {
      return err(createAppError({ code: 'provider.manifest.invalid', message: 'Capability detail requiresAuth must be boolean.' }));
    }
    if (item['knownRestrictions'] !== undefined && (!Array.isArray(item['knownRestrictions']) || !item['knownRestrictions'].every(isNonEmptyString))) {
      return err(createAppError({ code: 'provider.manifest.invalid', message: 'Capability detail knownRestrictions must be non-empty strings.' }));
    }

    details.push({
      key: key as ProviderCapabilityKey,
      supported: item['supported'],
      ...(typeof item['rateLimitRpm'] === 'number' ? { rateLimitRpm: item['rateLimitRpm'] } : {}),
      ...(typeof item['requiresAuth'] === 'boolean' ? { requiresAuth: item['requiresAuth'] } : {}),
      ...(Array.isArray(item['knownRestrictions']) ? { knownRestrictions: item['knownRestrictions'] as string[] } : {}),
    });
  }

  return ok(details);
}

export function validateProviderManifest(input: unknown): AppResult<ProviderManifest> {
  if (!isPlainObject(input)) {
    return err(createAppError({ code: 'provider.manifest.invalid', message: 'Manifest must be an object.' }));
  }

  if (!isNonEmptyString(input['id'])) {
    return err(
      createAppError({ code: 'provider.manifest.invalid', message: 'Manifest id is required.' }),
    );
  }

  if (!isNonEmptyString(input['name'])) {
    return err(
      createAppError({ code: 'provider.manifest.invalid', message: 'Manifest name is required.' }),
    );
  }

  if (!isNonEmptyString(input['version'])) {
    return err(
      createAppError({ code: 'provider.manifest.invalid', message: 'Manifest version is required.' }),
    );
  }

  const source = input['source'];
  if (!isPlainObject(source) || !isNonEmptyString(source['url']) || !isHttpUrl(source['url'])) {
    return err(
      createAppError({
        code: 'provider.manifest.invalid',
        message: 'Manifest source.url must be a valid http/https URL.',
      }),
    );
  }

  if (source['homepageUrl'] !== undefined && !isHttpUrl(source['homepageUrl'])) {
    return err(
      createAppError({
        code: 'provider.manifest.invalid',
        message: 'Manifest source.homepageUrl must be a valid http/https URL.',
      }),
    );
  }

  if (source['manifestUrl'] !== undefined && !isHttpUrl(source['manifestUrl'])) {
    return err(
      createAppError({
        code: 'provider.manifest.invalid',
        message: 'Manifest source.manifestUrl must be a valid http/https URL.',
      }),
    );
  }

  const compatibility = input['compatibility'];
  if (!isPlainObject(compatibility)) {
    return err(
      createAppError({
        code: 'provider.manifest.invalid',
        message: 'Manifest compatibility is required.',
      }),
    );
  }

  const platforms = compatibility['platforms'];
  if (!Array.isArray(platforms) || platforms.length === 0) {
    return err(
      createAppError({
        code: 'provider.manifest.invalid',
        message: 'Manifest compatibility.platforms must be a non-empty array.',
      }),
    );
  }

  const allowedPlatforms = new Set(['web', 'desktop', 'mobile']);
  for (const p of platforms) {
    if (typeof p !== 'string' || !allowedPlatforms.has(p)) {
      return err(
        createAppError({
          code: 'provider.manifest.invalid',
          message: 'Manifest compatibility.platforms has invalid entry.',
        }),
      );
    }
  }

  const capabilities = input['capabilities'];
  if (!isValidCapabilityMap(capabilities)) {
    return err(
      createAppError({
        code: 'provider.manifest.invalid',
        message: 'Manifest capabilities must be a non-empty object of known boolean flags.',
      }),
    );
  }

  const capabilityDetailsResult = validateCapabilityDetails(input['capabilityDetails']);
  if (!capabilityDetailsResult.ok) return capabilityDetailsResult;

  const permissions = input['permissions'];
  if (!Array.isArray(permissions) || permissions.length === 0) {
    return err(
      createAppError({
        code: 'provider.manifest.invalid',
        message: 'Manifest permissions must be a non-empty array.',
      }),
    );
  }

  const allowedPermissions: ReadonlySet<ProviderPermission> = new Set([
    'network.http',
    'network.websocket',
    'storage.local',
    'storage.read',
    'storage.write',
  ]);

  for (const perm of permissions) {
    if (typeof perm !== 'string' || !allowedPermissions.has(perm as ProviderPermission)) {
      return err(
        createAppError({
          code: 'provider.manifest.invalid',
          message: 'Manifest permissions contains unknown permission.',
        }),
      );
    }
  }

  const languages = input['languages'];
  if (!Array.isArray(languages) || languages.length === 0 || !languages.every((l) => isNonEmptyString(l))) {
    return err(
      createAppError({
        code: 'provider.manifest.invalid',
        message: 'Manifest languages must be a non-empty array of non-empty strings.',
      }),
    );
  }

  const contentFlags = input['contentFlags'];
  if (!isPlainObject(contentFlags)) {
    return err(
      createAppError({
        code: 'provider.manifest.invalid',
        message: 'Manifest contentFlags is required.',
      }),
    );
  }

  for (const flag of ['nsfw', 'suggestive', 'violence'] as const) {
    if (typeof contentFlags[flag] !== 'boolean') {
      return err(
        createAppError({
          code: 'provider.manifest.invalid',
          message: `Manifest contentFlags.${flag} must be boolean.`,
        }),
      );
    }
  }

  const manifest: ProviderManifest = {
    id: toProviderId(String(input['id'])),
    name: String(input['name']),
    version: String(input['version']),
    ...(typeof input['description'] === 'string' ? { description: input['description'] } : {}),
    source: {
      url: String(source['url']),
      ...(isNonEmptyString(source['homepageUrl'])
        ? { homepageUrl: String(source['homepageUrl']) }
        : {}),
      ...(isNonEmptyString(source['manifestUrl'])
        ? { manifestUrl: String(source['manifestUrl']) }
        : {}),
      ...(isNonEmptyString(source['publisher'])
        ? { publisher: String(source['publisher']) }
        : {}),
    },
    compatibility: {
      ...(isNonEmptyString(compatibility['minAppVersion'])
        ? { minAppVersion: String(compatibility['minAppVersion']) }
        : {}),
      ...(isNonEmptyString(compatibility['maxAppVersion'])
        ? { maxAppVersion: String(compatibility['maxAppVersion']) }
        : {}),
      platforms: platforms as ProviderManifest['compatibility']['platforms'],
    },
    capabilities,
    ...(capabilityDetailsResult.value !== undefined ? { capabilityDetails: capabilityDetailsResult.value } : {}),
    permissions: permissions as readonly ProviderPermission[],
    languages: languages as readonly string[],
    contentFlags: {
      nsfw: Boolean(contentFlags['nsfw']),
      suggestive: Boolean(contentFlags['suggestive']),
      violence: Boolean(contentFlags['violence']),
    },
    ...(isNonEmptyString(input['checksum']) ? { checksum: String(input['checksum']) } : {}),
    ...(isNonEmptyString(input['signature']) ? { signature: String(input['signature']) } : {}),
  };

  return ok(manifest);
}
