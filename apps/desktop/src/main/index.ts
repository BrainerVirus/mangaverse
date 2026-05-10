import { fork, type ChildProcess } from 'node:child_process';
import { app, BrowserWindow, shell } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rendererPort = process.env.MANGAVERSE_RENDERER_PORT ?? '45123';

let mainWindow: BrowserWindow | null = null;
let nitroProcess: ChildProcess | null = null;
let productionRendererUrl: string | null = null;

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
      PORT: rendererPort,
      NITRO_HOST: '127.0.0.1',
      HOST: '127.0.0.1',
    },
    silent: false,
  });

  const url = `http://127.0.0.1:${rendererPort}`;
  productionRendererUrl = url;
  return waitForHttpOk(url).then(() => url);
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

  mainWindow.loadURL(url);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }: { url: string }) => {
    shell.openExternal(target);
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

app.whenReady().then(() => {
  bootstrap().catch((err) => {
    console.error(err);
    app.quit();
  });
});

app.on('before-quit', () => {
  nitroProcess?.kill();
  nitroProcess = null;
});

app.on('window-all-closed', () => {
  nitroProcess?.kill();
  nitroProcess = null;
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
