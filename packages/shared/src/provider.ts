import { z } from 'zod';

import type { AppResult } from './result.js';
import { createAppError, err, ok } from './result.js';
import type { ContentRating, ProviderId } from './manga.js';
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

export interface ProviderSettingsValues {
  readonly enabled?: boolean;
  readonly preferredLanguages?: readonly string[];
  readonly nsfwAllowed?: boolean;
  readonly includedTags?: readonly string[];
  readonly excludedTags?: readonly string[];
  readonly contentRatingFilters?: readonly ContentRating[];
  readonly regionLocale?: string;
  readonly authStatePlaceholder?: 'anonymous' | 'session' | 'unknown';
  readonly providerOptions?: Readonly<Record<string, unknown>>;
  readonly rateLimitOverrideRpm?: number;
  readonly defaultSort?: string;
}

export function hasProviderCapability(
  manifest: ProviderManifest,
  capability: ProviderCapabilityKey,
): boolean {
  return manifest.capabilities[capability] === true;
}

const CAPABILITY_KEYS = [
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
] as const satisfies readonly ProviderCapabilityKey[];

const PERMISSION_KEYS = [
  'network.http',
  'network.websocket',
  'storage.local',
  'storage.read',
  'storage.write',
] as const satisfies readonly ProviderPermission[];

const CAPABILITIES_MESSAGE =
  'Manifest capabilities must be a non-empty object of known boolean flags.';
const LANGUAGES_MESSAGE = 'Manifest languages must be a non-empty array of non-empty strings.';

const nonEmptyString = (message: string) =>
  z.string({ error: message }).refine((value) => value.trim().length > 0, { error: message });

const httpUrl = (message: string) => z.url({ protocol: /^https?$/, error: message });

// Optional metadata keeps the old tolerance: a non-string value is dropped, not rejected.
const optionalText = z
  .unknown()
  .transform((value) => (typeof value === 'string' ? value : undefined))
  .exactOptional();
const optionalNonEmptyText = z
  .unknown()
  .transform((value) => (typeof value === 'string' && value.trim().length > 0 ? value : undefined))
  .exactOptional();

const capabilityDetailSchema = z.object(
  {
    key: z.enum(CAPABILITY_KEYS, { error: 'Capability detail key is invalid.' }),
    supported: z.boolean({ error: 'Capability detail supported must be boolean.' }),
    rateLimitRpm: z
      .number({ error: 'Capability detail rateLimitRpm must be non-negative.' })
      .min(0, { error: 'Capability detail rateLimitRpm must be non-negative.' })
      .exactOptional(),
    requiresAuth: z
      .boolean({ error: 'Capability detail requiresAuth must be boolean.' })
      .exactOptional(),
    knownRestrictions: z
      .array(nonEmptyString('Capability detail knownRestrictions must be non-empty strings.'), {
        error: 'Capability detail knownRestrictions must be non-empty strings.',
      })
      .exactOptional(),
  },
  { error: 'Each capability detail must be an object.' },
);

const providerManifestSchema = z.object(
  {
    id: nonEmptyString('Manifest id is required.'),
    name: nonEmptyString('Manifest name is required.'),
    version: nonEmptyString('Manifest version is required.'),
    source: z.object(
      {
        url: httpUrl('Manifest source.url must be a valid http/https URL.'),
        homepageUrl: httpUrl(
          'Manifest source.homepageUrl must be a valid http/https URL.',
        ).exactOptional(),
        manifestUrl: httpUrl(
          'Manifest source.manifestUrl must be a valid http/https URL.',
        ).exactOptional(),
        publisher: optionalNonEmptyText,
      },
      { error: 'Manifest source.url must be a valid http/https URL.' },
    ),
    compatibility: z.object(
      {
        minAppVersion: optionalNonEmptyText,
        maxAppVersion: optionalNonEmptyText,
        platforms: z
          .array(
            z.enum(['web', 'desktop', 'mobile'], {
              error: 'Manifest compatibility.platforms has invalid entry.',
            }),
            { error: 'Manifest compatibility.platforms must be a non-empty array.' },
          )
          .min(1, { error: 'Manifest compatibility.platforms must be a non-empty array.' }),
      },
      { error: 'Manifest compatibility is required.' },
    ),
    capabilities: z
      .partialRecord(
        z.enum(CAPABILITY_KEYS, { error: CAPABILITIES_MESSAGE }),
        z.boolean({ error: CAPABILITIES_MESSAGE }),
        { error: CAPABILITIES_MESSAGE },
      )
      .refine((value) => Object.keys(value).length > 0, { error: CAPABILITIES_MESSAGE }),
    capabilityDetails: z
      .array(capabilityDetailSchema, { error: 'Manifest capabilityDetails must be an array.' })
      .exactOptional(),
    permissions: z
      .array(
        z.enum(PERMISSION_KEYS, { error: 'Manifest permissions contains unknown permission.' }),
        {
          error: 'Manifest permissions must be a non-empty array.',
        },
      )
      .min(1, { error: 'Manifest permissions must be a non-empty array.' }),
    languages: z
      .array(nonEmptyString(LANGUAGES_MESSAGE), { error: LANGUAGES_MESSAGE })
      .min(1, { error: LANGUAGES_MESSAGE }),
    contentFlags: z.object(
      {
        nsfw: z.boolean({ error: 'Manifest contentFlags.nsfw must be boolean.' }),
        suggestive: z.boolean({ error: 'Manifest contentFlags.suggestive must be boolean.' }),
        violence: z.boolean({ error: 'Manifest contentFlags.violence must be boolean.' }),
      },
      { error: 'Manifest contentFlags is required.' },
    ),
    description: optionalText,
    checksum: optionalNonEmptyText,
    signature: optionalNonEmptyText,
  },
  { error: 'Manifest must be an object.' },
);

export const providerSettingsSchema = z.object({
  enabled: z.boolean().exactOptional(),
  preferredLanguages: z.array(z.string()).exactOptional(),
  nsfwAllowed: z.boolean().exactOptional(),
  includedTags: z.array(z.string()).exactOptional(),
  excludedTags: z.array(z.string()).exactOptional(),
  contentRatingFilters: z
    .array(
      z.enum(['unknown', 'safe', 'suggestive', 'mature', 'explicit'] satisfies ContentRating[]),
    )
    .exactOptional(),
  regionLocale: z.string().exactOptional(),
  authStatePlaceholder: z.enum(['anonymous', 'session', 'unknown']).exactOptional(),
  providerOptions: z.record(z.string(), z.unknown()).exactOptional(),
  rateLimitOverrideRpm: z.number().exactOptional(),
  defaultSort: z.string().exactOptional(),
});

export function validateProviderManifest(input: unknown): AppResult<ProviderManifest> {
  const parsed = providerManifestSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      createAppError({
        code: 'provider.manifest.invalid',
        message: parsed.error.issues[0]?.message ?? 'Manifest is invalid.',
      }),
    );
  }

  const data = parsed.data;
  return ok({
    id: toProviderId(data.id),
    name: data.name,
    version: data.version,
    ...(data.description !== undefined ? { description: data.description } : {}),
    source: {
      url: data.source.url,
      ...(data.source.homepageUrl !== undefined ? { homepageUrl: data.source.homepageUrl } : {}),
      ...(data.source.manifestUrl !== undefined ? { manifestUrl: data.source.manifestUrl } : {}),
      ...(data.source.publisher !== undefined ? { publisher: data.source.publisher } : {}),
    },
    compatibility: {
      ...(data.compatibility.minAppVersion !== undefined
        ? { minAppVersion: data.compatibility.minAppVersion }
        : {}),
      ...(data.compatibility.maxAppVersion !== undefined
        ? { maxAppVersion: data.compatibility.maxAppVersion }
        : {}),
      platforms: data.compatibility.platforms,
    },
    capabilities: data.capabilities,
    ...(data.capabilityDetails !== undefined ? { capabilityDetails: data.capabilityDetails } : {}),
    permissions: data.permissions,
    languages: data.languages,
    contentFlags: data.contentFlags,
    ...(data.checksum !== undefined ? { checksum: data.checksum } : {}),
    ...(data.signature !== undefined ? { signature: data.signature } : {}),
  });
}
