import type { ProviderCapabilityKey, ProviderManifest, ProviderPermission } from '@app/shared';

export interface CapabilityDisplayRow {
  readonly key: ProviderCapabilityKey;
  readonly label: string;
  readonly enabled: boolean;
}

export interface PermissionDisplayRow {
  readonly key: ProviderPermission;
  readonly label: string;
  readonly description: string;
}

const CAP_LABELS: Readonly<Record<ProviderCapabilityKey, string>> = {
  'discovery.search': 'Search',
  'discovery.advancedSearch': 'Advanced search',
  'discovery.latest': 'Latest updates',
  'discovery.popular': 'Popular titles',
  'discovery.browse': 'Browse catalogs',
  'metadata.details': 'Series details',
  'metadata.chapters': 'Chapter lists',
  'metadata.pages': 'Page images',
  'metadata.recommendations': 'Recommendations',
  'metadata.relatedTitles': 'Related titles',
  'metadata.tags': 'Tags',
  'metadata.languages': 'Languages',
  'auth.login': 'Login',
  'auth.logout': 'Logout',
  'auth.library': 'Remote library',
  'content.nsfw': 'Mature content',
  'content.ratingFilter': 'Content rating filters',
  'content.tagFilter': 'Tag filters',
  'download.chapters': 'Chapter downloads',
  'download.pages': 'Page downloads',
  'tracking.sync': 'Progress sync',
  'tracking.link': 'External tracking links',
  'ops.officialApi': 'Official API',
  'ops.scraping': 'Web scraping',
  'ops.antiBot': 'Anti-bot measures',
};

const PERM_LABELS: Readonly<Record<ProviderPermission, { label: string; description: string }>> = {
  'network.http': {
    label: 'HTTP network',
    description: 'Access remote servers over HTTP or HTTPS.',
  },
  'network.websocket': {
    label: 'WebSocket network',
    description: 'Use WebSocket connections.',
  },
  'storage.local': {
    label: 'Local storage',
    description: 'Persist small amounts of data locally.',
  },
  'storage.read': {
    label: 'Read storage',
    description: 'Read stored provider data.',
  },
  'storage.write': {
    label: 'Write storage',
    description: 'Write stored provider data.',
  },
};

export function buildCapabilityDisplay(manifest: ProviderManifest): readonly CapabilityDisplayRow[] {
  const rows: CapabilityDisplayRow[] = [];
  for (const key of Object.keys(manifest.capabilities) as ProviderCapabilityKey[]) {
    rows.push({
      key,
      label: CAP_LABELS[key] ?? key,
      enabled: manifest.capabilities[key] === true,
    });
  }
  return rows;
}

export function buildPermissionDisplay(manifest: ProviderManifest): readonly PermissionDisplayRow[] {
  return manifest.permissions.map((key) => ({
    key,
    label: PERM_LABELS[key]?.label ?? key,
    description: PERM_LABELS[key]?.description ?? '',
  }));
}
