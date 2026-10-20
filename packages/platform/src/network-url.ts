import { isSafeExternalUrl } from './url-protocol.js';

type Ipv4 = readonly [number, number, number, number];

function parseIpv4(value: string): Ipv4 | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  const a = octets[0];
  const b = octets[1];
  const c = octets[2];
  const d = octets[3];
  if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
  if (![a, b, c, d].every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
    return null;
  }
  return [a, b, c, d];
}

function isBlockedIpv4([a, b, c]: Ipv4): boolean {
  return (
    a === 0 || // "this" network, including 0.0.0.0
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, including cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

function isBlockedIpv6(value: string): boolean {
  const address = value.toLowerCase();
  if (address === '::' || address === '::1') return true;

  // IPv4-mapped forms: `::ffff:127.0.0.1` and `::ffff:7f00:1`.
  const mapped = /^::ffff:(.+)$/.exec(address);
  if (mapped?.[1] !== undefined) {
    const dotted = parseIpv4(mapped[1]);
    if (dotted !== null) return isBlockedIpv4(dotted);
    const hextets = mapped[1].split(':');
    const hi = Number.parseInt(hextets[0] ?? '', 16);
    const lo = Number.parseInt(hextets[1] ?? '', 16);
    if (hextets.length === 2 && Number.isInteger(hi) && Number.isInteger(lo)) {
      return isBlockedIpv4([(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff]);
    }
  }

  const first = Number.parseInt(address.split(':')[0] ?? '', 16);
  if (Number.isNaN(first)) return false;
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 // ff00::/8 multicast
  );
}

/** True for loopback, private, link-local, multicast or reserved address literals. */
export function isBlockedIpAddress(address: string): boolean {
  const literal = address.replace(/^\[|\]$/g, '');
  const ipv4 = parseIpv4(literal);
  if (ipv4 !== null) return isBlockedIpv4(ipv4);
  return literal.includes(':') && isBlockedIpv6(literal);
}

/** True for hostname literals the main process must never fetch from. */
export function isBlockedNetworkHost(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === 'metadata.google.internal') return true;
  return isBlockedIpAddress(host);
}

/** http(s) URL whose literal host is not loopback, private, link-local or reserved. */
export function isSafeNetworkFetchUrl(url: string): boolean {
  if (!isSafeExternalUrl(url)) return false;
  try {
    return !isBlockedNetworkHost(new URL(url).hostname);
  } catch {
    return false;
  }
}
