import { lookup } from 'node:dns/promises';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  MessageChannelMain,
  protocol,
  safeStorage,
  session,
  shell,
  utilityProcess,
} from 'electron';
import {
  detectElectronCapabilities,
  isSafeExternalUrl,
  type PlatformCapabilities,
} from '@app/platform';
import {
  APP_ORIGIN,
  APP_SCHEME,
  APP_SCHEME_PRIVILEGES,
  createAppProtocolHandler,
} from './app-protocol.js';
import {
  createInstallProtocolStore,
  ingestArgvForInstallUrls,
  registerInstallProtocolAppEvents,
} from './protocol-handoff.js';
import { createTrustedFrameCheck, registerDataHostIpc, superviseDataHost } from './data-host.js';
import { registerPlatformIpc } from './platform-ipc.js';
import { createProviderAllowlist } from './provider-allowlist.js';
import { registerProviderNetworkIpc } from './provider-network-ipc.js';
import { createFixtureTransport } from './provider-network-fixture.js';
import {
  createPageProtocolHandler,
  createPageStore,
  PAGE_SCHEME,
  PAGE_SCHEME_PRIVILEGES,
} from './page-store.js';
import { registerPageStoreIpc } from './page-store-ipc.js';
import { createSecureStorageModel } from './secure-storage.js';
import {
  buildContentSecurityPolicy,
  PAGE_CONTENT_SECURITY_POLICY,
  registerDevContentSecurityPolicy,
} from './content-security-policy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Production loads the static client shell from app://app; nothing listens on a port.
const PRODUCTION_RENDERER_URL = `${APP_ORIGIN}/`;

let mainWindow: BrowserWindow | null = null;
/** Windows this process created: only their main frames reach the data host. */
const ownedWindows = new Set<BrowserWindow>();

// Every window main constructs is owned; one a page opened has an opener and never is, though
// the open handler below denies those anyway.
app.on('browser-window-created', (_event, window) => {
  if (window.webContents.opener !== null) return;
  ownedWindows.add(window);
  window.once('closed', () => ownedWindows.delete(window));
});

// Must run before app ready: a standard, secure scheme gets an origin, `'self'` and fetch.
protocol.registerSchemesAsPrivileged([APP_SCHEME_PRIVILEGES, PAGE_SCHEME_PRIVILEGES]);

const installProtocolStore = createInstallProtocolStore();
registerInstallProtocolAppEvents({ app, store: installProtocolStore });

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

// The Express health/diagnostics server is gone (spec 04 X6): nothing used its HTTP, and the
// renderer reads diagnostics over IPC. The IPC channel stays and reports it as not running.
const LOCAL_SERVICE_INFO = { running: false, host: null, port: null } as const;

function registerAppProtocol() {
  const handler = createAppProtocolHandler({
    root: join(__dirname, '../renderer'),
    contentSecurityPolicy: buildContentSecurityPolicy(false),
  });
  session.defaultSession.protocol.handle(APP_SCHEME, handler);
}

/** The origins whose main frames are the app: the dev server in dev, app://app otherwise. */
function appOrigins(): readonly string[] {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  // An unparseable dev URL allows no origin rather than throwing at startup.
  const devOrigin = devUrl ? URL.parse(devUrl)?.origin : undefined;
  return devUrl ? [devOrigin].filter((origin) => origin !== undefined) : [APP_ORIGIN];
}

const ownedMainFrames = () => [...ownedWindows].map((window) => window.webContents.mainFrame);

/**
 * Cached pages live as files under the profile (spec 04 X5, X13). The renderer writes and
 * deletes them over authorized IPC and reads them only through page://, by opaque id.
 */
function registerPageStore(
  isTrustedFrame: ReturnType<typeof createTrustedFrameCheck>,
): ReturnType<typeof createPageStore> {
  const store = createPageStore(join(app.getPath('userData'), 'pages'));
  session.defaultSession.protocol.handle(
    PAGE_SCHEME,
    createPageProtocolHandler({
      store,
      allowedOrigins: appOrigins(),
      contentSecurityPolicy: PAGE_CONTENT_SECURITY_POLICY,
    }),
  );
  registerPageStoreIpc({ ipcMain, store, isTrustedFrame });
  return store;
}

function buildCapabilities(): PlatformCapabilities {
  return detectElectronCapabilities({
    secureStorage: safeStorage.isEncryptionAvailable(),
  });
}

function createWindow(url: string) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
    titleBarStyle: 'default',
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  void mainWindow.loadURL(url);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }: { url: string }) => {
    if (isSafeExternalUrl(target)) {
      void shell.openExternal(target);
    }
    return { action: 'deny' };
  });
}

/**
 * Starts the data host's utility process; the database lives in the profile directory. A host
 * that dies is restarted and every window that had connected gets a port to the new one.
 */
function startDataHost(isTrustedFrame: ReturnType<typeof createTrustedFrameCheck>) {
  const databasePath = join(app.getPath('userData'), 'mangaverse.sqlite');
  const supervisor = superviseDataHost({
    fork: () => {
      const child = utilityProcess.fork(
        fileURLToPath(new URL('./data-host-process.js', import.meta.url)),
        [],
        {
          serviceName: 'MangaVerse data host',
          env: { ...process.env, MANGAVERSE_DATA_HOST_DB: databasePath },
        },
      );
      return {
        get pid() {
          return child.pid;
        },
        postMessage: (message, transfer) => child.postMessage(message, transfer),
        onExit: (listener) => child.once('exit', listener),
      };
    },
    schedule: (run, delayMs) => void setTimeout(run, delayMs),
    now: () => Date.now(),
    onRestarted: () => ipc.reconnectWindows(),
    onGaveUp: (exitCode) => {
      // oxlint-disable-next-line no-console -- ruling: desktop-console-bootstrap: the host keeps dying, so no window can be told over the host; every call still fails with its typed timeout, and the console is main's only record of why.
      // react-doctor-disable-next-line eslint/no-console -- ruling: desktop-console-bootstrap: the host keeps dying, so no window can be told over the host; every call still fails with its typed timeout, and the console is main's only record of why.
      console.error(`[data-host] stopped restarting after repeated exits (last code ${exitCode})`);
    },
  });
  app.once('before-quit', () => supervisor.stop());
  const ipc = registerDataHostIpc({
    ipcMain,
    createChannel: () => new MessageChannelMain(),
    hostProcess: supervisor,
    isTrustedFrame,
    ownedMainFrames,
  });
}

function bootstrap() {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    createWindow(devUrl);
    return;
  }
  registerAppProtocol();
  createWindow(PRODUCTION_RENDERER_URL);
}

void app.whenReady().then(async () => {
  try {
    try {
      app.setAsDefaultProtocolClient('mangaverse');
    } catch {
      // Protocol registration can fail in some dev setups; deep links remain best-effort.
    }

    ingestArgvForInstallUrls(process.argv, installProtocolStore);

    const buildDiagnosticsSnapshot = () => {
      const caps = buildCapabilities();
      const { runtime: _r, ...capabilityFlags } = caps;
      return {
        appVersion: app.getVersion(),
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        nodeVersion: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        userDataConfigured: true,
        localService: LOCAL_SERVICE_INFO,
        capabilityFlags,
      };
    };

    if (process.env.VITE_DEV_SERVER_URL) {
      registerDevContentSecurityPolicy();
    }

    const secureModel = createSecureStorageModel({
      safeStorage,
      storePath: join(app.getPath('userData'), 'secure-storage.json'),
      readFile: (p) => readFile(p, 'utf8'),
      writeFile: (p, data) => writeFile(p, data, 'utf8'),
    });

    const isTrustedFrame = createTrustedFrameCheck({
      ownedMainFrames,
      allowedOrigins: appOrigins(),
    });

    const productionTransport = {
      resolveHostAddresses: async (hostname: string) =>
        (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address),
      // Log the refusal without the path or query: a provider URL can carry a token.
      log: (event: { code: string; url?: string }) => {
        const host =
          event.url !== undefined && URL.canParse(event.url) ? new URL(event.url).hostname : '';
        // oxlint-disable-next-line no-console -- ruling: provider-network-refusal-log: a refused provider request has no renderer to report to (the caller gets only a typed error), so main's log is the sole record of which host and rule refused it.
        // react-doctor-disable-next-line eslint/no-console -- ruling: provider-network-refusal-log: a refused provider request has no renderer to report to (the caller gets only a typed error), so main's log is the sole record of which host and rule refused it.
        console.warn(`[provider-network] refused ${event.code}${host ? ` host=${host}` : ''}`);
      },
    };

    // Test-only: the Electron E2E answers the recorded MangaDex hosts from a local
    // fixture server. All allowlist, address, redirect and limit checks still run.
    const fixtureOrigin = process.env.MANGAVERSE_E2E_PROVIDER_FIXTURE;
    const networkTransport =
      fixtureOrigin === undefined
        ? productionTransport
        : createFixtureTransport(fixtureOrigin, productionTransport);

    registerPlatformIpc({
      ipcMain,
      getTargetWindow: () => mainWindow,
      dialog,
      clipboard,
      shell,
      readFileUtf8: (p) => readFile(p, 'utf8'),
      writeFileUtf8: (p, c) => writeFile(p, c, 'utf8'),
      getCapabilities: () => buildCapabilities(),
      protocolTakePendingInstallUrl: () => installProtocolStore.take(),
      secureStorage: secureModel,
      getLocalServiceInfo: () => LOCAL_SERVICE_INFO,
      buildDiagnosticsSnapshot,
      networkTransport,
    });

    const pageStore = registerPageStore(isTrustedFrame);
    const allowlist = createProviderAllowlist();
    registerProviderNetworkIpc({
      ipcMain,
      allowlist,
      isTrustedFrame,
      networkTransport,
      pageStore,
    });
    startDataHost(isTrustedFrame);
    bootstrap();
  } catch (err) {
    // oxlint-disable-next-line no-console -- ruling: desktop-console-bootstrap: this catch quits the app on the next line, so no UI can surface the failure; the console is the only record and `.oxlintrc.json` already allows console under apps/desktop/src/main/**.
    // react-doctor-disable-next-line eslint/no-console -- ruling: desktop-console-bootstrap: this catch quits the app on the next line, so no UI can surface the failure; the console is the only record and `.oxlintrc.json` already allows console under apps/desktop/src/main/**.
    console.error(err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(process.env.VITE_DEV_SERVER_URL ?? PRODUCTION_RENDERER_URL);
  }
});
