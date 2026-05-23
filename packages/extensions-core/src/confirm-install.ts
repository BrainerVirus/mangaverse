import type { AppResult } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';
import type { ExtensionInstallMetadata } from '@app/shared';
import { toExtensionInstallId } from '@app/shared';
import type { AppDrizzleDb } from '@app/db';
import { upsertInstalledExtension } from '@app/db';

import { transitionExtensionInstall } from './install-session.js';
import type { ExtensionInstallSession } from './install-types.js';

export interface ExtensionCoreDependencies {
  readonly db: AppDrizzleDb;
}

export async function confirmExtensionInstall(
  session: ExtensionInstallSession,
  deps: ExtensionCoreDependencies,
): Promise<AppResult<ExtensionInstallSession>> {
  if (session.step !== 'awaitingConfirmation' || !session.manifest || !session.source) {
    return err(
      createAppError({
        code: 'extensions.core.install.bad_state',
        message: 'Install must be awaiting confirmation with a resolved manifest.',
      }),
    );
  }

  let next = transitionExtensionInstall(session, { type: 'confirm' });
  const manifest = session.manifest;
  const now = new Date().toISOString();

  const sourceUrl =
    session.source.kind === 'manual' || session.source.kind === 'protocol'
      ? session.source.manifestUrl
      : manifest.source.url;

  const metadata: ExtensionInstallMetadata = {
    id: toExtensionInstallId(String(manifest.id)),
    manifest,
    sourceUrl,
    ...(session.source.kind === 'registry' ? { registryUrl: session.source.registryUrl } : {}),
    ...(manifest.checksum !== undefined ? { checksum: manifest.checksum } : {}),
    installedVersion: manifest.version,
    enabled: true,
    installedAt: now,
    updatedAt: now,
    state: 'installed',
    health: 'ok',
    warnings: session.preview?.warnings ?? [],
  };

  const write = await upsertInstalledExtension(deps.db, metadata);
  if (!write.ok) {
    next = transitionExtensionInstall(next, { type: 'installFailed', error: write.error });
    return err(write.error);
  }

  next = transitionExtensionInstall(next, { type: 'installSucceeded' });
  return ok(next);
}
