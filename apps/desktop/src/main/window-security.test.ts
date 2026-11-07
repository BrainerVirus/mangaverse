import { isSafeExternalUrl } from '@app/platform';
import { describe, expect, it, vi } from 'vitest';
import {
  ALLOWED_PERMISSIONS,
  decideNavigation,
  guardWebContents,
  isAppUrl,
  registerNavigationGuards,
  registerPermissionPolicy,
  type GuardableContents,
  type NavigationEventLike,
  type PermissionSession,
  type WebContentsCreatedSource,
} from './window-security.js';

const APP = ['app://app'];
const policy = { appOrigins: APP, isSafeExternalUrl };

describe('isAppUrl', () => {
  it.each(['app://app', 'app://app/', 'app://app/library', 'app://app/manga/a?x=1#y'])(
    'accepts %s',
    (url) => expect(isAppUrl(url, APP)).toBe(true),
  );

  it.each([
    'app://application/library',
    'app://app.evil.test/',
    'app://other/index.html',
    'page://store/abc',
    'https://app/',
    'https://evil.test/?u=app://app/',
    '',
  ])('refuses %s', (url) => expect(isAppUrl(url, APP)).toBe(false));
});

describe('decideNavigation', () => {
  it('allows the app origin', () => {
    expect(decideNavigation('app://app/settings', policy)).toBe('allow');
  });

  it('hands an http(s) link to the browser', () => {
    expect(decideNavigation('https://mangadex.org/title/1', policy)).toBe('external');
    expect(decideNavigation('http://example.test/', policy)).toBe('external');
  });

  it.each([
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'page://store/' + 'a'.repeat(64),
    'mangaverse://install-extension?url=https%3A%2F%2Fx.test',
    'app://other/',
    'not a url',
  ])('denies %s', (url) => expect(decideNavigation(url, policy)).toBe('deny'));

  it('allows the dev server origin when it is the app origin', () => {
    const dev = { ...policy, appOrigins: ['http://localhost:5173'] };
    expect(decideNavigation('http://localhost:5173/library', dev)).toBe('allow');
    expect(decideNavigation('app://app/', dev)).toBe('deny');
  });

  it('allows devtools:// only when asked to', () => {
    expect(decideNavigation('devtools://devtools/bundled/x.html', policy)).toBe('deny');
    expect(
      decideNavigation('devtools://devtools/bundled/x.html', { ...policy, allowDevTools: true }),
    ).toBe('allow');
  });
});

type Listener = (event: NavigationEventLike) => void;

function fakeContents() {
  const listeners = new Map<string, Listener>();
  const contents: GuardableContents = {
    on: (event, listener) => void listeners.set(event, listener),
  };
  const fire = (name: string, url: string, extra: Partial<NavigationEventLike> = {}) => {
    const preventDefault = vi.fn<() => void>();
    listeners.get(name)?.({ url, preventDefault, ...extra });
    return preventDefault;
  };
  return { contents, fire, listeners };
}

describe('guardWebContents', () => {
  const setup = () => {
    const openExternal = vi.fn<(url: string) => void>();
    const ctx = fakeContents();
    guardWebContents(ctx.contents, { ...policy, openExternal });
    return { ...ctx, openExternal };
  };

  it('lets the app navigate inside its own origin', () => {
    const { fire, openExternal } = setup();
    expect(fire('will-navigate', 'app://app/library')).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('cancels a navigation to a web page and opens it in the browser instead', () => {
    const { fire, openExternal } = setup();
    expect(fire('will-navigate', 'https://example.test/a')).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://example.test/a');
  });

  it.each(['file:///etc/hosts', 'javascript:void(0)', 'page://store/x', 'app://other/'])(
    'cancels %s without opening anything',
    (url) => {
      const { fire, openExternal } = setup();
      expect(fire('will-navigate', url)).toHaveBeenCalledOnce();
      expect(openExternal).not.toHaveBeenCalled();
    },
  );

  it('cancels a redirect off the app origin and never opens it', () => {
    const { fire, openExternal } = setup();
    expect(fire('will-redirect', 'https://example.test/')).toHaveBeenCalledOnce();
    expect(fire('will-redirect', 'app://app/library')).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('cancels a subframe that leaves the app origin, but leaves main-frame events to will-navigate', () => {
    const { fire, openExternal } = setup();
    expect(
      fire('will-frame-navigate', 'https://example.test/', { isMainFrame: false }),
    ).toHaveBeenCalledOnce();
    expect(
      fire('will-frame-navigate', 'https://example.test/', { isMainFrame: true }),
    ).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('refuses every <webview> attach', () => {
    const { fire } = setup();
    expect(fire('will-attach-webview', '')).toHaveBeenCalledOnce();
  });

  it('guards every web contents created later', () => {
    const created: { listener?: (event: unknown, contents: GuardableContents) => void } = {};
    const source: WebContentsCreatedSource = {
      on: (_event, listener) => void (created.listener = listener),
    };
    registerNavigationGuards(source, { ...policy, openExternal: vi.fn<(url: string) => void>() });
    const ctx = fakeContents();
    created.listener?.({}, ctx.contents);
    expect([...ctx.listeners.keys()].sort()).toEqual([
      'will-attach-webview',
      'will-frame-navigate',
      'will-navigate',
      'will-redirect',
    ]);
  });
});

describe('permission policy', () => {
  function install() {
    const handlers: {
      request?: Parameters<PermissionSession['setPermissionRequestHandler']>[0];
      check?: Parameters<PermissionSession['setPermissionCheckHandler']>[0];
      device?: Parameters<PermissionSession['setDevicePermissionHandler']>[0];
    } = {};
    const session: PermissionSession = {
      setPermissionRequestHandler: (handler) => void (handlers.request = handler),
      setPermissionCheckHandler: (handler) => void (handlers.check = handler),
      setDevicePermissionHandler: (handler) => void (handlers.device = handler),
    };
    registerPermissionPolicy(session, { appOrigins: APP });
    const request = (permission: string, details: object) => {
      const callback = vi.fn<(granted: boolean) => void>();
      handlers.request?.(null, permission, callback, details);
      return callback.mock.calls[0]?.[0];
    };
    const check = (permission: string, origin: string, details: object = {}) =>
      handlers.check?.(null, permission, origin, details);
    return { handlers, request, check };
  }

  it('grants the reader fullscreen and a sanitized clipboard write to the app origin only', () => {
    const { request, check } = install();
    for (const permission of ALLOWED_PERMISSIONS) {
      expect(request(permission, { requestingUrl: 'app://app/read', isMainFrame: true })).toBe(
        true,
      );
      expect(check(permission, 'app://app', { requestingUrl: 'app://app/read' })).toBe(true);
    }
  });

  it.each([
    'media',
    'geolocation',
    'notifications',
    'clipboard-read',
    'midi',
    'openExternal',
    'hid',
    'serial',
    'unknown',
  ])('denies %s even for the app origin', (permission) => {
    const { request, check } = install();
    expect(request(permission, { requestingUrl: 'app://app/', isMainFrame: true })).toBe(false);
    expect(check(permission, 'app://app')).toBe(false);
  });

  it('denies an allowed permission to any other origin, a subframe or an unknown requester', () => {
    const { request, check } = install();
    expect(request('fullscreen', { requestingUrl: 'https://evil.test/', isMainFrame: true })).toBe(
      false,
    );
    expect(request('fullscreen', { requestingUrl: 'app://app/', isMainFrame: false })).toBe(false);
    expect(request('fullscreen', {})).toBe(false);
    expect(check('fullscreen', 'https://evil.test')).toBe(false);
    expect(check('fullscreen', 'app://app', { isMainFrame: false })).toBe(false);
  });

  it('never grants a device', () => {
    const { handlers } = install();
    expect(handlers.device?.({})).toBe(false);
  });
});
