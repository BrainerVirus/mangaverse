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
  /** Replaces any previous patterns for `providerId`; an empty list is valid and denies everything. */
  register(providerId: string, domains: readonly string[]): readonly string[];
  unregister(providerId: string): void;
  /**
   * Makes this the complete table: every provider in `registrations` is set, and
   * every id missing from it is removed. Validation runs before anything changes,
   * so a malformed snapshot leaves the previous table intact.
   */
  replaceAll(registrations: readonly ProviderNetworkRegistration[]): void;
  /** Whether provider `providerId` may reach the host in `url`. Unknown providers always refuse. */
  allowsUrl(providerId: string, url: string): boolean;
  patternsFor(providerId: string): readonly string[] | undefined;
  size(): number;
}

/**
 * Main's provider allowlist. The renderer registers validated manifest domains at
 * startup and after install/import, and unregisters on uninstall; main never takes
 * a domain list with a request, so a compromised renderer cannot widen its reach
 * mid-flight.
 */
export function createProviderAllowlist(): ProviderAllowlist {
  const byProvider = new Map<string, readonly string[]>();

  return {
    register(providerId, domains) {
      const id = normalizeProviderId(providerId);
      if (!isProviderId(id)) {
        throw new Error('Invalid provider id.');
      }
      const patterns = normalizeProviderDomains(domains);
      byProvider.set(id, patterns);
      return patterns;
    },
    unregister(providerId) {
      byProvider.delete(normalizeProviderId(providerId));
    },
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
    allowsUrl(providerId, url) {
      const patterns = byProvider.get(normalizeProviderId(providerId));
      if (patterns === undefined || patterns.length === 0) return false;
      if (!URL.canParse(url)) return false;
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
      if (parsed.username.length > 0 || parsed.password.length > 0) return false;
      const host = parsed.hostname.replace(/^\[|\]$/g, '');
      return providerDomainsAllowHost(patterns, host);
    },
    patternsFor(providerId) {
      return byProvider.get(normalizeProviderId(providerId));
    },
    size() {
      return byProvider.size;
    },
  };
}
