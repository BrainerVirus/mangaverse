import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { externalizeInlineScripts, hasInlineScript } from "./static-shell.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const workspaceRoot = join(root, "../..");
const webRoot = join(root, "../web");
const shellBuildRoot = join(webRoot, "dist/static-shell");
const rendererRoot = join(root, "dist/renderer");
// On Windows pnpm is a .cmd shim; execFileSync needs the extension.
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

console.log("Cleaning old desktop dist...");
rmSync(join(root, "dist"), { force: true, recursive: true });
rmSync(shellBuildRoot, { force: true, recursive: true });

console.log("Building workspace packages for the renderer...");
execFileSync(pnpm, ["--filter", "@app/web^...", "build"], {
  cwd: workspaceRoot,
  stdio: "inherit",
});

// The web deployment stays SSR on Nitro; this flag builds the same app as a prerendered
// client shell for the app:// protocol (apps/web/vite.config.ts).
console.log("Building static client shell...");
execFileSync(pnpm, ["--filter", "@app/web", "run", "build:static-shell"], {
  cwd: workspaceRoot,
  stdio: "inherit",
  env: { ...process.env, MANGAVERSE_STATIC_SHELL: "1" },
});

console.log("Bundling Electron main and data host...");
execFileSync("node", ["scripts/bundle-main.mjs"], {
  cwd: root,
  stdio: "inherit",
});

console.log("Building Electron preload...");
execFileSync("node", ["scripts/bundle-preload.mjs"], {
  cwd: root,
  stdio: "inherit",
});

// Only the client output ships: the Nitro server bundle stays behind in apps/web/dist.
console.log("Copying static client shell into dist/renderer...");
const publicDir = join(shellBuildRoot, "public");
if (!existsSync(join(publicDir, "index.html"))) {
  throw new Error(`Static shell build produced no index.html in ${publicDir}`);
}
cpSync(publicDir, rendererRoot, { recursive: true });

const indexPath = join(rendererRoot, "index.html");
const { html, scripts } = externalizeInlineScripts(readFileSync(indexPath, "utf8"));
for (const { fileName, source } of scripts) {
  writeFileSync(join(rendererRoot, fileName), source);
}
if (hasInlineScript(html)) {
  throw new Error("Static shell still has inline scripts the production CSP would refuse");
}
writeFileSync(indexPath, html);

for (const serverPath of ["server", "server/index.mjs", "nitro.json"]) {
  if (existsSync(join(rendererRoot, serverPath))) {
    throw new Error(`dist/renderer must not contain a server bundle (${serverPath})`);
  }
}

console.log("Desktop build complete.");
