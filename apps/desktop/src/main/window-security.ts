/**
 * Navigation and permission policy for every web contents main creates (Electron security
 * checklist: limit navigation, handle session permission requests).
 *
 * The renderer only ever shows the app origin (`app://app` in production, the Vite dev server
 * in development). Anything else is refused here: a top-level navigation off the app origin
 * is cancelled, an http(s) link opens in the user's browser the way `setWindowOpenHandler`
 * already treats a new-window request, and a `<webview>` is never attached. Browser
 * permissions are denied unless they are on the short allowlist below and come from the app
 * origin's main frame. Clipboard and diagnostics go through main-owned IPC, not through a
 * browser permission, so they are unaffected.
 */

/**
 * The only permissions the app origin may use. `fullscreen` is the reader's fullscreen
 * toggle (`requestFullscreen`); `clipboard-sanitized-write` is a plain text/image copy.
 * Everything else (camera, microphone, geolocation, notifications, clipboard read, MIDI,
 * HID, serial and so on) is denied.
 */
export const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set([
  'fullscreen',
  'clipboard-sanitized-write',
]);

/** True when `url` is the origin itself or a path under it. Custom schemes have no `URL.origin`. */
export function isAppUrl(url: string, appOrigins: readonly string[]): boolean {
  return appOrigins.some((origin) => url === origin || url.startsWith(`${origin}/`));
}

export type NavigationDecision = 'allow' | 'external' | 'deny';

export interface NavigationPolicyOptions {
  readonly appOrigins: readonly string[];
  readonly isSafeExternalUrl: (url: string) => boolean;
  /** Development only: the DevTools front end navigates inside its own `devtools://` origin. */
  readonly allowDevTools?: boolean;
}

/** What to do with a top-level navigation to `url`. */
export function decideNavigation(
  url: string,
  options: NavigationPolicyOptions,
): NavigationDecision {
  if (isAppUrl(url, options.appOrigins)) return 'allow';
  if (options.allowDevTools === true && url.startsWith('devtools://')) return 'allow';
  return options.isSafeExternalUrl(url) ? 'external' : 'deny';
}

/** The part of Electron's navigation events this module reads. */
export interface NavigationEventLike {
  readonly url?: string;
  readonly isMainFrame?: boolean;
  preventDefault(): void;
}

type NavigationEventName =
  | 'will-navigate'
  | 'will-redirect'
  | 'will-frame-navigate'
  | 'will-attach-webview';

/** The slice of `WebContents` the guard drives (injectable for tests). */
export interface GuardableContents {
  on(event: NavigationEventName, listener: (event: NavigationEventLike) => void): unknown;
}

export interface NavigationGuardOptions extends NavigationPolicyOptions {
  readonly openExternal: (url: string) => void;
}

/**
 * Wires one web contents. `will-navigate` (main frame, user or page initiated) allows the app
 * origin, hands a safe external link to the browser and cancels the rest; `will-redirect`
 * cancels a redirect off the app origin; `will-frame-navigate` cancels a subframe that leaves
 * it (the app has no iframes). Programmatic `loadURL` from main is not subject to these events.
 */
export function guardWebContents(
  contents: GuardableContents,
  options: NavigationGuardOptions,
): void {
  contents.on('will-navigate', (event) => {
    const url = event.url ?? '';
    const decision = decideNavigation(url, options);
    if (decision === 'allow') return;
    event.preventDefault();
    if (decision === 'external') options.openExternal(url);
  });

  contents.on('will-redirect', (event) => {
    if (decideNavigation(event.url ?? '', options) === 'allow') return;
    event.preventDefault();
  });

  contents.on('will-frame-navigate', (event) => {
    // The main frame is `will-navigate`'s job; handling both would open an external link twice.
    if (event.isMainFrame !== false) return;
    if (decideNavigation(event.url ?? '', options) === 'allow') return;
    event.preventDefault();
  });

  // The app never uses <webview>; refuse any attach rather than sanitize its parameters.
  contents.on('will-attach-webview', (event) => event.preventDefault());
}

/** The slice of Electron's `app` this module subscribes to. */
export interface WebContentsCreatedSource {
  on(
    event: 'web-contents-created',
    listener: (event: unknown, contents: GuardableContents) => void,
  ): unknown;
}

/** Guards every web contents the app ever creates, including popups Chromium makes. */
export function registerNavigationGuards(
  source: WebContentsCreatedSource,
  options: NavigationGuardOptions,
): void {
  source.on('web-contents-created', (_event, contents) => guardWebContents(contents, options));
}

/** Whether a permission is granted to the page at `requestingUrl`. */
function isPermissionAllowed(
  permission: string,
  requestingUrl: string,
  appOrigins: readonly string[],
): boolean {
  return ALLOWED_PERMISSIONS.has(permission) && isAppUrl(requestingUrl, appOrigins);
}

/** The details Electron passes to both permission handlers (only what this module reads). */
interface PermissionDetails {
  readonly requestingUrl?: string;
  readonly isMainFrame?: boolean;
}

/** The slice of `Session` the policy installs onto (injectable for tests). */
export interface PermissionSession {
  setPermissionRequestHandler(
    handler:
      | ((
          webContents: unknown,
          permission: string,
          callback: (granted: boolean) => void,
          details: PermissionDetails,
        ) => void)
      | null,
  ): void;
  setPermissionCheckHandler(
    handler:
      | ((
          webContents: unknown,
          permission: string,
          requestingOrigin: string,
          details: PermissionDetails,
        ) => boolean)
      | null,
  ): void;
  setDevicePermissionHandler(handler: ((details: unknown) => boolean) | null): void;
}

/** Deny-by-default permissions for a session; only {@link ALLOWED_PERMISSIONS} from the app. */
export function registerPermissionPolicy(
  session: PermissionSession,
  options: { readonly appOrigins: readonly string[] },
): void {
  session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const fromMainFrame = details.isMainFrame !== false;
    callback(
      fromMainFrame &&
        isPermissionAllowed(permission, details.requestingUrl ?? '', options.appOrigins),
    );
  });

  session.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) => {
    if (details.isMainFrame === false) return false;
    return isPermissionAllowed(
      permission,
      details.requestingUrl ?? requestingOrigin,
      options.appOrigins,
    );
  });

  // No USB, HID, serial or Bluetooth device is ever granted.
  session.setDevicePermissionHandler(() => false);
}
