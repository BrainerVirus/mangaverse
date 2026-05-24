import { defineConfig, type Plugin } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

function localDevProvidersPlugin(): Plugin {
  return {
    name: 'mangaverse-local-dev-providers',
    configureServer(server) {
      server.middlewares.use('/__dev/providers/mangadex/manifest.json', (_req, res) => {
        const manifestPath = join(workspaceRoot, 'local-dev/providers/mangadex/manifest.json');
        if (!existsSync(manifestPath)) {
          res.statusCode = 404;
          res.end('MangaDex dev manifest not found. Run: pnpm dev:install-mangadex');
          return;
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(readFileSync(manifestPath, 'utf8'));
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
