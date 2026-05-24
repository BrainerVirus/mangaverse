import { defineConfig } from 'vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';

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
  ],
});
