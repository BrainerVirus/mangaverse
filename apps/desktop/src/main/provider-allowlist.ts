import { isProviderDomainPattern, providerDomainsAllowHost } from '@app/shared';
import type { ProviderNetworkRegistration } from '@app/platform';

/** A provider id main will key the allowlist by: the manifest id, normalized. */
function isProviderId(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value);
}

function normalizeProviderId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeProviderDomains(domains: readonly string[]): readonly string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const domain of domains) {
    const normalized = domain.trim().toLowerCase();
    if (!isProviderDomainPattern(normalized)) {
      throw new Error(`Invalid provider network domain: ${domain}`);
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

export interface ProviderAllowlist {
  /**
   * Makes this the complete table: every provider in `registrations` is set, and
   * every id missing from it is removed. Validation runs before anything changes,
   * so a malformed snapshot leaves the previous table intact.
   */
  replaceAll(registrations: readonly ProviderNetworkRegistration[]): void;
  /** Removes one provider at once; its next request is refused until a snapshot adds it back. */
  revoke(providerId: string): void;
  /** Whether provider `providerId` may reach the host in `url`. Unknown providers always refuse. */
  allowsUrl(providerId: string, url: string): boolean;
  /** Whether `url`'s host falls inside any registered provider's declared domains. */
  claimedByAnyProvider(url: string): boolean;
  patternsFor(providerId: string): readonly string[] | undefined;
  size(): number;
}

function hostOf(url: string): string | undefined {
  if (!URL.canParse(url)) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
  if (parsed.username.length > 0 || parsed.password.length > 0) return undefined;
  return parsed.hostname.replace(/^\[|\]$/g, '');
}

/**
 * Main's provider allowlist: which hosts each enabled provider may reach, from its
 * manifest's declared domains. The trust boundary is the renderer: it reads the
 * installed providers from its database and sends main the whole enabled table
 * (`replaceAll`) at startup and after every install, import, update and toggle,
 * and a targeted `revoke` before a disable or uninstall commits. Main never takes
 * a domain list with a request, so a renderer that only issues requests cannot
 * widen a provider's reach; it can only use what the last snapshot granted.
 * Main starts empty, so every provider is refused until the first snapshot lands.
 */
export function createProviderAllowlist(): ProviderAllowlist {
  const byProvider = new Map<string, readonly string[]>();

  return {
    replaceAll(registrations) {
      const next = new Map<string, readonly string[]>();
      for (const registration of registrations) {
        const id = normalizeProviderId(registration.providerId);
        if (!isProviderId(id)) {
          throw new Error('Invalid provider id.');
        }
        next.set(id, normalizeProviderDomains(registration.domains));
      }
      byProvider.clear();
      for (const [id, patterns] of next) {
        byProvider.set(id, patterns);
      }
    },
    revoke(providerId) {
      byProvider.delete(normalizeProviderId(providerId));
    },
    allowsUrl(providerId, url) {
      const patterns = byProvider.get(normalizeProviderId(providerId));
      if (patterns === undefined || patterns.length === 0) return false;
      const host = hostOf(url);
      return host !== undefined && providerDomainsAllowHost(patterns, host);
    },
    claimedByAnyProvider(url) {
      const host = hostOf(url);
      if (host === undefined) return false;
      for (const patterns of byProvider.values()) {
        if (providerDomainsAllowHost(patterns, host)) return true;
      }
      return false;
    },
    patternsFor(providerId) {
      return byProvider.get(normalizeProviderId(providerId));
    },
    size() {
      return byProvider.size;
    },
  };
}
