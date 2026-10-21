import { defineConfig, type Plugin } from 'vite';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { nitro } from 'nitro/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';

// Base UI imports the CJS `use-sync-external-store` shim, which pnpm installs inside Base UI's
// own tree — not where the app-level resolver looks. The SSR pass therefore inlines it, and its
// `require('react')` stays a runtime require that loads a *second* React: every SSR render then
// dies in `useSyncExternalStore` with a null dispatcher. Keep the shim out of the SSR pass
// (`ssr.external`) and let Nitro bundle it next to React, as it already does for react-dom.
function baseUiShimInterop(): Plugin {
  const shimRE = /^use-sync-external-store\/shim(\/with-selector)?$/;
  return {
    name: 'base-ui-shim-interop',
    enforce: 'pre',
    async resolveId(id) {
      if (this.environment.name !== 'nitro' || !shimRE.test(id)) return null;
      const designSystem = await this.resolve('@app/design-system');
      const baseUi =
        designSystem && (await this.resolve('@base-ui/react', designSystem.id, { skipSelf: true }));
      return baseUi && (await this.resolve(id, baseUi.id, { skipSelf: true }));
    },
  };
}

// React Compiler through Babel: the experimental `compiler` option skips SSR, so use the
// documented preset and apply it to every environment. `panicThreshold: none` skips a
// component the compiler cannot handle instead of failing the build.
// Keep @babel/core on 7: compiler 1.0.0 errors on destructuring defaults under Babel 8.
const reactCompiler = reactCompilerPreset({
  target: '19',
  panicThreshold: 'none',
});
reactCompiler.rolldown.applyToEnvironmentHook = () => true;

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
    // Keep tslib external to avoid CJS helper interop in the SSR bundle.
    external: [
      'sql.js',
      'tslib',
      'use-sync-external-store/shim',
      'use-sync-external-store/shim/with-selector',
    ],
  },
  optimizeDeps: {
    // Pre-bundle sql.js so Vite emits a browser ESM default export (raw CJS has no ESM exports).
    include: ['sql.js'],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'app',
    }),
    viteReact(),
    babel({ presets: [reactCompiler] }),
    baseUiShimInterop(),
    nitro(),
  ],
});
