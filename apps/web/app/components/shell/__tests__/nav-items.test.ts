import { describe, expect, it } from 'vitest';
import { isNavActive, mobileTabs, sidebarNavGroups } from '../nav-items.js';

const settings = mobileTabs.find((item) => item.to === '/settings');
const extensions = sidebarNavGroups.flatMap((g) => g.items).find((i) => i.to === '/extensions');

describe('isNavActive', () => {
  it.each(['/settings', '/settings/reader', '/backup', '/advanced/diagnostics'])(
    'keeps Settings current on %s',
    (pathname) => {
      expect(settings).toBeDefined();
      expect(isNavActive(pathname, settings!)).toBe(true);
    },
  );

  it('keeps exact and child matching for items without activeFor', () => {
    expect(isNavActive('/extensions', extensions!)).toBe(true);
    expect(isNavActive('/extensions/demo', extensions!)).toBe(true);
    expect(isNavActive('/backup', extensions!)).toBe(false);
  });

  it('does not treat lookalike prefixes as hub pages', () => {
    expect(isNavActive('/backups', settings!)).toBe(false);
  });

  it('keeps the Advanced hub current only on itself', () => {
    const advanced = { to: '/advanced' };
    expect(isNavActive('/advanced', advanced)).toBe(true);
    expect(isNavActive('/advanced/diagnostics', advanced)).toBe(false);
  });
});
