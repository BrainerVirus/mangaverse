import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url));

const rendererUrl = process.env.MANGAVERSE_RENDERER_URL ?? 'http://localhost:5173';

function run(command, args, options = {}) {
  return spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
}

async function waitForRenderer(url) {
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
execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.preload.json'], { cwd: desktopRoot, stdio: 'inherit' });

console.log(`Starting TanStack Start renderer at ${rendererUrl}...`);
const web = run('pnpm', ['--filter', '@app/web', 'dev'], {
  cwd: workspaceRoot,
});

try {
  await waitForRenderer(rendererUrl);

  const desktop = run(electronPath, ['.'], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: rendererUrl,
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
