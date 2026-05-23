import type { AppDrizzleDb } from '@app/db';
import type {
  ExtensionFetchEnvironment,
  ExtensionInstallAction,
  ExtensionInstallSession,
} from '@app/extensions-core';
import type { AppResult } from '@app/shared';

export type { ExtensionInstallSession };

export async function createExtensionInstallSession(): Promise<ExtensionInstallSession> {
  const { createExtensionInstallSession: createSession } = await import('@app/extensions-core');
  return createSession();
}

export async function transitionExtensionInstall(
  session: ExtensionInstallSession,
  action: ExtensionInstallAction,
): Promise<ExtensionInstallSession> {
  const { transitionExtensionInstall: transition } = await import('@app/extensions-core');
  return transition(session, action);
}

export async function prepareManualProviderInstall(
  url: string,
  environment: ExtensionFetchEnvironment,
): Promise<AppResult<ExtensionInstallSession>> {
  const { prepareManualExtensionInstall } = await import('@app/extensions-core');
  return prepareManualExtensionInstall(url, environment);
}

export async function confirmProviderInstall(
  db: AppDrizzleDb,
  session: ExtensionInstallSession,
): Promise<AppResult<ExtensionInstallSession>> {
  const { confirmExtensionInstall } = await import('@app/extensions-core');
  return confirmExtensionInstall(session, { db });
}
