import { fileURLToPath } from 'node:url';

let migrationsFolderCache: string | undefined;

/** The bundled SQL migrations on disk, next to `src`/`dist`. */
export function getMigrationsFolder(): string {
  migrationsFolderCache ??= fileURLToPath(new URL('../migrations', import.meta.url));
  return migrationsFolderCache;
}
