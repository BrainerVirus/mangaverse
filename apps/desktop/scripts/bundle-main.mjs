import { cpSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Main and the data-host utility process ship as self-contained ESM bundles (#215, spec 04
// X8). Only `electron` (and Node's builtins, which esbuild keeps external on `platform:
// node`) stays a runtime import: workspace packages, zod, drizzle and electron-updater are
// inlined, so the asar needs no node_modules or workspace symlinks.

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const workspaceRoot = join(desktopRoot, "../..");
const outDir = join(desktopRoot, "dist/main");

// Bundled CJS dependencies (electron-updater among them) may reach for `require`, which
// ESM does not provide on its own. `__filename`/`__dirname` stay out: src/main/index.ts
// declares its own, and esbuild would otherwise inject a duplicate.
const cjsShims = [
  "import { createRequire as __createRequire } from 'node:module';",
  "const require = __createRequire(import.meta.url);",
].join("\n");

const shared = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  external: ["electron"],
  sourcemap: false,
  logLevel: "info",
  banner: { js: cjsShims },
};

await Promise.all([
  build({
    ...shared,
    entryPoints: [join(desktopRoot, "src/main/index.ts")],
    outfile: join(outDir, "index.js"),
  }),
  build({
    ...shared,
    entryPoints: [join(desktopRoot, "src/main/data-host-process.ts")],
    outfile: join(outDir, "data-host-process.js"),
  }),
]);

// Drizzle reads the migration SQL from disk. Main points the data host at this copy
// (`MANGAVERSE_MIGRATIONS_FOLDER`), so the bundle does not depend on the workspace layout.
cpSync(join(workspaceRoot, "packages/db/migrations"), join(outDir, "migrations"), {
  recursive: true,
});

console.log("Bundled main, data host and migrations.");
