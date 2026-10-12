#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(__dirname, '..');
const templateDir = join(__dirname, 'mangadex-dev');
const targetDir = join(workspaceRoot, 'local-dev/providers/mangadex');

const rendererPort = process.env.MANGAVERSE_RENDERER_PORT ?? '5173';
const rendererHost = process.env.MANGAVERSE_RENDERER_HOST ?? 'localhost';
const manifestUrl = `http://${rendererHost}:${rendererPort}/__dev/providers/mangadex/manifest.json`;

mkdirSync(targetDir, { recursive: true });

const manifestTemplate = JSON.parse(
  readFileSync(join(templateDir, 'manifest.template.json'), 'utf8'),
);
manifestTemplate.source.manifestUrl = manifestUrl;

writeFileSync(join(targetDir, 'manifest.json'), `${JSON.stringify(manifestTemplate, null, 2)}\n`, 'utf8');
cpSync(join(templateDir, 'provider.template.mjs'), join(targetDir, 'provider.mjs'));

console.log('');
console.log('MangaDex local dev provider installed.');
console.log('');
console.log('Files written to: local-dev/providers/mangadex/');
console.log('');
console.log('Install in the app:');
console.log(`  1. Run pnpm dev:desktop (or pnpm dev:web)`);
console.log('  2. Open Extensions → Install provider');
console.log(`  3. Paste manifest URL: ${manifestUrl}`);
console.log('');
console.log('After install, use Search with a query to fetch live MangaDex results (dev mode only).');
console.log('Tip: `pnpm dev:desktop` auto-registers MangaDex on first load when the manifest is served.');
console.log('');

if (!existsSync(join(workspaceRoot, 'local-dev/.gitkeep'))) {
  mkdirSync(join(workspaceRoot, 'local-dev'), { recursive: true });
}
