// Runs the repository suite over the data host (ADR 0001): test files keep their source, but
// their repository imports resolve to the routed procedures and their harness to the host
// harness, so every repository call crosses a MessageChannel into node:sqlite.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

const src = fileURLToPath(new URL('./src/', import.meta.url));
const routedFile = resolve(src, 'routed.gen.ts');
const sqlJsHarness = resolve(src, 'testing/sqljs-harness.ts');
const hostHarness = resolve(src, 'testing/host-harness.ts');
const ROUTED = '\0routed:';

const procedureModules = new Set(
  [
    ...readFileSync(resolve(src, 'procedure-sources.ts'), 'utf8').matchAll(/from '(\.[^']+)\.js'/g),
  ].map((match) => resolve(src, `${match[1]}.ts`)),
);

function dbFirstNames(file: string): string[] {
  return [
    ...readFileSync(file, 'utf8').matchAll(
      /^export (?:async )?function (\w+)(?:<[^(]*>)?\(\s*db\b/gm,
    ),
  ].map((match) => match[1] as string);
}

const routeOverHost: Plugin = {
  name: 'route-repositories-over-host',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer === undefined || !/\.test\.ts$/.test(importer) || !source.startsWith('.')) {
      return null;
    }
    const target = resolve(dirname(importer), source.replace(/\.js$/, '.ts'));
    if (target === sqlJsHarness) return hostHarness;
    return procedureModules.has(target) ? `${ROUTED}${target}` : null;
  },
  load(id) {
    if (!id.startsWith(ROUTED)) return null;
    const file = id.slice(ROUTED.length);
    return [
      `export * from ${JSON.stringify(file)};`,
      `export { ${dbFirstNames(file).join(', ')} } from ${JSON.stringify(routedFile)};`,
    ].join('\n');
  },
};

export default defineConfig({
  plugins: [routeOverHost],
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // These test the renderer's sql.js session and migrator, which the host replaces.
    exclude: [
      'src/browser.test.ts',
      'src/bundled-migrations.test.ts',
      'src/persistent-database.test.ts',
      'src/persistent-database-title-fold.test.ts',
      'src/host/**',
      // Query plans are read from the sql.js connection's prepared statements; the host
      // suite still runs the same page queries and their results.
      'src/repositories/library-page-plan.test.ts',
    ],
    // sql.js-only tests: one runs the sql.js migrator on `raw`; four patch sql.js's
    // `raw.prepare` to fake a lower variable limit, which cannot reach the host's connection.
    // All five still run on sql.js in vitest.config.ts.
    testNamePattern: new RegExp(
      `^(?!.*(${[
        'applies migrations idempotently on sql\\.js',
        'deletes across the SQL ceiling',
        'Given identities and tags across two chunks',
        'statement count does not grow with the list',
        'sets categories across the SQL ceiling',
      ].join('|')}))`,
    ),
    setupFiles: ['./vitest.host.setup.ts'],
  },
});
