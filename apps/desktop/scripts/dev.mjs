import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parsePortInUseMessage, parseViteLocalUrl } from './vite-dev-url.mjs';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url));

const configuredRendererUrl = process.env.MANGAVERSE_RENDERER_URL ?? null;
const VITE_URL_TIMEOUT_MS = 120_000;

// Chromium DevTools Autofill protocol errors in Electron are harmless noise (see docs/PLAN.md Phase 10.5).

function run(command, args, options = {}) {
  return spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
}

function startWebDevServer() {
  const child = run('pnpm', ['--filter', '@app/web', 'dev'], {
    cwd: workspaceRoot,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let detectedUrl = configuredRendererUrl;

    const finish = (error, url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (error) reject(error);
      else resolve({ child, rendererUrl: url });
    };

    const timeoutId = setTimeout(() => {
      finish(
        new Error(
          `Timed out after ${VITE_URL_TIMEOUT_MS / 1000}s waiting for Vite to print a Local URL. ` +
            'Check for stale dev servers or set MANGAVERSE_RENDERER_URL.',
        ),
      );
    }, VITE_URL_TIMEOUT_MS);

    const inspectChunk = (chunk, stream) => {
      const text = chunk.toString();
      stream.write(text);

      if (configuredRendererUrl) return;

      const busyPort = parsePortInUseMessage(text);
      if (busyPort !== null) {
        console.warn(
          `[desktop dev] Port ${busyPort} is busy; Vite will pick another port. Electron will follow Vite's Local URL.`,
        );
      }

      const localUrl = parseViteLocalUrl(text);
      if (localUrl && !detectedUrl) {
        detectedUrl = localUrl;
        console.log(`[desktop dev] Detected renderer URL: ${detectedUrl}`);
        finish(null, detectedUrl);
      }
    };

    child.stdout?.on('data', (chunk) => inspectChunk(chunk, process.stdout));
    child.stderr?.on('data', (chunk) => inspectChunk(chunk, process.stderr));

    child.on('error', (error) => finish(error));
    child.on('close', (code) => {
      if (configuredRendererUrl && !settled) {
        finish(null, configuredRendererUrl);
        return;
      }
      if (!settled) {
        finish(new Error(`Vite exited with code ${code ?? 'unknown'} before reporting a Local URL`));
      }
    });

    if (configuredRendererUrl) {
      console.log(`[desktop dev] Using MANGAVERSE_RENDERER_URL: ${configuredRendererUrl}`);
      finish(null, configuredRendererUrl);
    }
  });
}

async function waitForRenderer(url) {
  console.log(`[desktop dev] Waiting for renderer at ${url}...`);
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await delay(500);
    }
  }

  throw new Error(`Timed out waiting for renderer at ${url}`);
}

console.log('Compiling Electron main and preload...');
execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], { cwd: desktopRoot, stdio: 'inherit' });
execFileSync('node', ['scripts/bundle-preload.mjs'], { cwd: desktopRoot, stdio: 'inherit' });

console.log('Starting TanStack Start renderer (Vite)...');
const { child: web, rendererUrl } = await startWebDevServer();

try {
  await waitForRenderer(rendererUrl);
  console.log(`[desktop dev] Launching Electron with renderer URL: ${rendererUrl}`);

  const desktop = run(electronPath, ['.'], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: rendererUrl,
      MANGAVERSE_RENDERER_URL: rendererUrl,
    },
  });

  await new Promise((resolve, reject) => {
    desktop.on('error', reject);
    desktop.on('close', (code) => {
      web.kill('SIGTERM');
      if (code === 0 || code === null) resolve();
      else reject(new Error(`Electron exited with ${code}`));
    });
  });
} catch (error) {
  web.kill('SIGTERM');
  throw error;
}
