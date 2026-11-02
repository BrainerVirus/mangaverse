import { fileURLToPath } from 'node:url';

let migrationsFolderCache: string | undefined;

/**
 * The bundled SQL migrations on disk, next to `src`/`dist`.
 *
 * The packaged desktop app bundles this package into one main-process file, where the
 * module-relative `dist` path no longer points at `packages/db/migrations`. Main therefore
 * sets `MANGAVERSE_MIGRATIONS_FOLDER` to the copy it ships under `dist/main/migrations`
 * (spec 04 X8, #215); development keeps resolving relative to this module.
 */
export function getMigrationsFolder(): string {
  const configured =
    typeof process !== 'undefined' ? process.env.MANGAVERSE_MIGRATIONS_FOLDER : undefined;
  migrationsFolderCache ??=
    configured !== undefined && configured.length > 0
      ? configured
      : fileURLToPath(new URL('../migrations', import.meta.url));
  return migrationsFolderCache;
}
