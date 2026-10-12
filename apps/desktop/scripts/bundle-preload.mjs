import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));

await build({
  entryPoints: [`${desktopRoot}/src/preload/index.ts`],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: `${desktopRoot}/dist/preload/index.js`,
  external: ['electron'],
  logLevel: 'info',
});
