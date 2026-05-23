import { defineConfig } from 'vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteTsConfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  server: {
    port: 5173,
  },
  plugins: [
    tailwindcss(),
    viteTsConfigPaths({ projects: ['./tsconfig.json'] }),
    tanstackStart({
      srcDirectory: 'app',
    }),
    viteReact(),
    nitro(),
  ],
  environments: {
    ssr: {
      build: {
        rollupOptions: {
          input: './server.ts',
        },
      },
    },
  },
});
