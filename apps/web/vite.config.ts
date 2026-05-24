import { defineConfig, type Plugin } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const templateDir = join(workspaceRoot, 'scripts/mangadex-dev');

function readDevMangaDexManifest(host: string): string {
  const installedPath = join(workspaceRoot, 'local-dev/providers/mangadex/manifest.json');
  if (existsSync(installedPath)) {
    return readFileSync(installedPath, 'utf8');
  }

  const template = JSON.parse(readFileSync(join(templateDir, 'manifest.template.json'), 'utf8'));
  template.source.manifestUrl = `http://${host}/__dev/providers/mangadex/manifest.json`;
  return `${JSON.stringify(template, null, 2)}\n`;
}

function localDevProvidersPlugin(): Plugin {
  return {
    name: 'mangaverse-local-dev-providers',
    configureServer(server) {
      server.middlewares.use('/__dev/providers/mangadex/manifest.json', (req, res) => {
        const host = req.headers.host ?? `localhost:${server.config.server.port ?? 5173}`;
        res.setHeader('Content-Type', 'application/json');
        res.end(readDevMangaDexManifest(host));
      });
    },
  };
}

export default defineConfig({
  server: {
    port: 5173,
  },
  resolve: {
    tsconfigPaths: true,
  },
  assetsInclude: ['**/*.wasm'],
  ssr: {
    // sql.js ships a browser WASM build; keep it out of Nitro/unwasm SSR transforms.
    external: ['sql.js'],
  },
  optimizeDeps: {
    exclude: ['sql.js'],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'app',
    }),
    viteReact(),
    nitro(),
    localDevProvidersPlugin(),
  ],
});
