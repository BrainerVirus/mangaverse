import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const workspaceRoot = join(root, '../..');

console.log('Cleaning old desktop dist...');
rmSync(join(root, 'dist'), { force: true, recursive: true });

console.log('Building web renderer...');
execFileSync('pnpm', ['--filter', '@app/web', 'build'], {
  cwd: workspaceRoot,
  stdio: 'inherit',
});

console.log('Building Electron main process...');
execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], {
  cwd: root,
  stdio: 'inherit',
});

console.log('Building Electron preload...');
execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.preload.json'], {
  cwd: root,
  stdio: 'inherit',
});

console.log('Copying Nitro output (.output) for embedded renderer server...');
cpSync(join(root, '../web/.output'), join(root, 'dist/renderer'), {
  recursive: true,
});

console.log('Desktop build complete.');
