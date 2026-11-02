import type { AppResult, ProviderManifest, ProviderSettingsValues } from '@app/shared';
import {
  createAppError,
  err,
  hasProviderCapability,
  ok,
  providerSettingsSchema,
} from '@app/shared';

export type { ProviderSettingsValues } from '@app/shared';

const MAX_RATE_RPM = 10_000;

export function validateProviderSettings(
  manifest: ProviderManifest,
  input: unknown,
): AppResult<ProviderSettingsValues> {
  const parsed = providerSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === 'rateLimitOverrideRpm') {
      return err(
        createAppError({
          code: 'extensions.core.settings.bad_rate_limit',
          message: 'rateLimitOverrideRpm must be a non-negative number.',
          providerId: manifest.id,
        }),
      );
    }
    const path = issue?.path.map(String).join('.') ?? '';
    return err(
      createAppError({
        code: 'extensions.core.settings.invalid',
        message:
          path.length === 0
            ? 'Provider settings must be an object.'
            : `Provider settings.${path}: ${issue?.message ?? 'Invalid value.'}`,
        providerId: manifest.id,
      }),
    );
  }

  const settings = parsed.data;
  type Mutable = { -readonly [K in keyof ProviderSettingsValues]?: ProviderSettingsValues[K] };
  const out: Mutable = {};

  if (settings.enabled !== undefined) {
    out.enabled = settings.enabled;
  }

  if (settings.preferredLanguages !== undefined) {
    if (!hasProviderCapability(manifest, 'metadata.languages')) {
      return err(
        createAppError({
          code: 'extensions.core.settings.unsupported',
          message: 'preferredLanguages requires metadata.languages capability.',
          providerId: manifest.id,
        }),
      );
    }
    out.preferredLanguages = settings.preferredLanguages;
  }

  if (settings.nsfwAllowed !== undefined) {
    const allowed =
      hasProviderCapability(manifest, 'content.nsfw') ||
      manifest.contentFlags.nsfw === true ||
      hasProviderCapability(manifest, 'content.ratingFilter');
    if (!allowed) {
      return err(
        createAppError({
          code: 'extensions.core.settings.unsupported',
          message: 'nsfwAllowed requires content.nsfw or compatible content flags.',
          providerId: manifest.id,
        }),
      );
    }
    out.nsfwAllowed = settings.nsfwAllowed;
  }

  if (settings.includedTags !== undefined || settings.excludedTags !== undefined) {
    if (!hasProviderCapability(manifest, 'content.tagFilter')) {
      return err(
        createAppError({
          code: 'extensions.core.settings.unsupported',
          message: 'Tag filters require content.tagFilter capability.',
          providerId: manifest.id,
        }),
      );
    }
    if (settings.includedTags !== undefined) out.includedTags = settings.includedTags;
    if (settings.excludedTags !== undefined) out.excludedTags = settings.excludedTags;
  }

  if (settings.contentRatingFilters !== undefined) {
    if (!hasProviderCapability(manifest, 'content.ratingFilter')) {
      return err(
        createAppError({
          code: 'extensions.core.settings.unsupported',
          message: 'contentRatingFilters requires content.ratingFilter capability.',
          providerId: manifest.id,
        }),
      );
    }
    out.contentRatingFilters = settings.contentRatingFilters;
  }

  if (settings.regionLocale !== undefined) {
    out.regionLocale = settings.regionLocale;
  }

  if (settings.authStatePlaceholder !== undefined) {
    const authCap =
      hasProviderCapability(manifest, 'auth.login') ||
      hasProviderCapability(manifest, 'auth.logout') ||
      hasProviderCapability(manifest, 'auth.library');
    if (!authCap) {
      return err(
        createAppError({
          code: 'extensions.core.settings.unsupported',
          message: 'authStatePlaceholder requires an auth capability.',
          providerId: manifest.id,
        }),
      );
    }
    out.authStatePlaceholder = settings.authStatePlaceholder;
  }

  if (settings.providerOptions !== undefined) {
    out.providerOptions = settings.providerOptions;
  }

  if (settings.rateLimitOverrideRpm !== undefined) {
    if (!Number.isFinite(settings.rateLimitOverrideRpm) || settings.rateLimitOverrideRpm < 0) {
      return err(
        createAppError({
          code: 'extensions.core.settings.bad_rate_limit',
          message: 'rateLimitOverrideRpm must be a non-negative number.',
          providerId: manifest.id,
        }),
      );
    }
    if (settings.rateLimitOverrideRpm > MAX_RATE_RPM) {
      return err(
        createAppError({
          code: 'extensions.core.settings.bad_rate_limit',
          message: `rateLimitOverrideRpm must be at most ${MAX_RATE_RPM}.`,
          providerId: manifest.id,
        }),
      );
    }
    out.rateLimitOverrideRpm = settings.rateLimitOverrideRpm;
  }

  if (settings.defaultSort !== undefined) {
    out.defaultSort = settings.defaultSort;
  }

  return ok(out as ProviderSettingsValues);
}
