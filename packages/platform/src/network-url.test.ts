import { describe, expect, it } from 'vitest';

import { isBlockedIpAddress, isBlockedNetworkHost, isSafeNetworkFetchUrl } from './network-url.js';

describe('isBlockedIpAddress', () => {
  it.each([
    '127.0.0.1',
    '127.10.20.30',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
  ])('blocks %s', (address) => {
    expect(isBlockedIpAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111', 'not-an-ip'])(
    'allows %s',
    (address) => {
      expect(isBlockedIpAddress(address)).toBe(false);
    },
  );
});

describe('isBlockedNetworkHost', () => {
  it.each(['localhost', 'LOCALHOST.', 'app.localhost', 'metadata.google.internal', '[::1]'])(
    'blocks %s',
    (host) => {
      expect(isBlockedNetworkHost(host)).toBe(true);
    },
  );

  it('allows a public hostname', () => {
    expect(isBlockedNetworkHost('example.com')).toBe(false);
  });
});

describe('isSafeNetworkFetchUrl', () => {
  it('accepts public http(s) URLs', () => {
    expect(isSafeNetworkFetchUrl('https://example.com/page.png?x=1')).toBe(true);
    expect(isSafeNetworkFetchUrl('http://example.com')).toBe(true);
  });

  it.each([
    'file:///etc/passwd',
    'ftp://example.com/x',
    'http://127.0.0.1/x',
    'http://localhost/x',
    'http://2130706433/x',
    'http://[::ffff:127.0.0.1]/x',
    'http://192.168.1.1/x',
  ])('rejects %s', (url) => {
    expect(isSafeNetworkFetchUrl(url)).toBe(false);
  });
});
