import { fork, type ChildProcess } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, clipboard, dialog, ipcMain, net, safeStorage, shell } from 'electron';
import {
  detectElectronCapabilities,
  isSafeExternalUrl,
  type PlatformCapabilities,
} from '@app/platform';
import { createDesktopLocalService } from './local-service.js';
import {
  createInstallProtocolStore,
  ingestArgvForInstallUrls,
  registerInstallProtocolAppEvents,
} from './protocol-handoff.js';
import { registerPlatformIpc } from './platform-ipc.js';
import { createSecureStorageModel } from './secure-storage.js';
import { registerContentSecurityPolicy } from './content-security-policy.js';
import { resolveRendererPort } from './renderer-port.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rendererPort = resolveRendererPort(process.env.MANGAVERSE_RENDERER_PORT);

let mainWindow: BrowserWindow | null = null;
let nitroProcess: ChildProcess | null = null;
let productionRendererUrl: string | null = null;

const installProtocolStore = createInstallProtocolStore();
registerInstallProtocolAppEvents({ app, store: installProtocolStore });

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

let snapshotForHttp: () => Record<string, unknown> = () => ({ status: 'boot' });

const desktopLocalService = createDesktopLocalService({
  getDiagnosticsPayload: () => snapshotForHttp(),
});

async function waitForHttpOk(url: string) {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`Timed out waiting for renderer at ${url}`);
}

function startProductionRenderer(): Promise<string> {
  if (productionRendererUrl) {
    return Promise.resolve(productionRendererUrl);
  }

  const rendererRoot = join(__dirname, '../renderer');
  const serverEntry = join(rendererRoot, 'server/index.mjs');

  nitroProcess = fork(serverEntry, [], {
    cwd: rendererRoot,
    env: {
      ...process.env,
      PORT: String(rendererPort),
      NITRO_HOST: '127.0.0.1',
      HOST: '127.0.0.1',
    },
    silent: false,
  });

  const url = `http://127.0.0.1:${rendererPort}`;
  productionRendererUrl = url;
  return waitForHttpOk(url).then(() => url);
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

async function bootstrap() {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    createWindow(devUrl);
    return;
  }
  const url = await startProductionRenderer();
  createWindow(url);
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
        localService: desktopLocalService.getInfo(),
        capabilityFlags,
      };
    };

    snapshotForHttp = () => ({ ...buildDiagnosticsSnapshot() });

    await desktopLocalService.start();

    registerContentSecurityPolicy(Boolean(process.env.VITE_DEV_SERVER_URL));

    const secureModel = createSecureStorageModel({
      safeStorage,
      storePath: join(app.getPath('userData'), 'secure-storage.json'),
      readFile: (p) => readFile(p, 'utf8'),
      writeFile: (p, data) => writeFile(p, data, 'utf8'),
    });

    registerPlatformIpc({
      ipcMain,
      getTargetWindow: () => mainWindow,
      dialog,
      clipboard,
      shell,
      net,
      readFileUtf8: (p) => readFile(p, 'utf8'),
      writeFileUtf8: (p, c) => writeFile(p, c, 'utf8'),
      getCapabilities: () => buildCapabilities(),
      protocolTakePendingInstallUrl: () => installProtocolStore.take(),
      secureStorage: secureModel,
      getLocalServiceInfo: () => desktopLocalService.getInfo(),
      buildDiagnosticsSnapshot,
    });

    await bootstrap();
  } catch (err) {
    // oxlint-disable-next-line no-console -- ruling: desktop-console-bootstrap: this catch quits the app on the next line, so no UI can surface the failure; the console is the only record and `.oxlintrc.json` already allows console under apps/desktop/src/main/**.
    // react-doctor-disable-next-line eslint/no-console -- ruling: desktop-console-bootstrap: this catch quits the app on the next line, so no UI can surface the failure; the console is the only record and `.oxlintrc.json` already allows console under apps/desktop/src/main/**.
    console.error(err);
    app.quit();
  }
});

app.on('before-quit', () => {
  nitroProcess?.kill();
  nitroProcess = null;
  void desktopLocalService.stop();
});

app.on('window-all-closed', () => {
  nitroProcess?.kill();
  nitroProcess = null;
  void desktopLocalService.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl) {
      createWindow(devUrl);
    } else if (productionRendererUrl) {
      createWindow(productionRendererUrl);
    }
  }
});
