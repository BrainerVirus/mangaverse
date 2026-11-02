import type { AppDrizzleDb } from '@app/db';
import {
  confirmExtensionInstall,
  createExtensionInstallSession as createSession,
  prepareManualExtensionInstall,
  transitionExtensionInstall as transitionSession,
} from './core/index.js';
import type {
  ExtensionFetchEnvironment,
  ExtensionInstallAction,
  ExtensionInstallSession,
} from './core/index.js';
import type { AppResult } from '@app/shared';

export type { ExtensionInstallSession };

export function createExtensionInstallSession(): ExtensionInstallSession {
  return createSession();
}

export function transitionExtensionInstall(
  session: ExtensionInstallSession,
  action: ExtensionInstallAction,
): ExtensionInstallSession {
  return transitionSession(session, action);
}

export async function prepareManualProviderInstall(
  url: string,
  environment: ExtensionFetchEnvironment,
): Promise<AppResult<ExtensionInstallSession>> {
  return prepareManualExtensionInstall(url, environment);
}

export async function confirmProviderInstall(
  db: AppDrizzleDb,
  session: ExtensionInstallSession,
): Promise<AppResult<ExtensionInstallSession>> {
  return confirmExtensionInstall(session, { db });
}
