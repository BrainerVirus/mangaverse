import { err, ok, type AppResult } from '@app/shared';
import {
  isValidSecureStorageKey,
  platformInvalidUrl,
  platformIoFailed,
  platformSecureStorageUnavailable,
} from '@app/platform';

export interface ElectronSafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

type JsonStore = Record<string, string>;

export interface SecureStorageModelDeps {
  readonly safeStorage: ElectronSafeStorageLike;
  readonly storePath: string;
  readonly readFile: (path: string) => Promise<string>;
  readonly writeFile: (path: string, data: string) => Promise<void>;
}

export function createSecureStorageModel(deps: SecureStorageModelDeps) {
  async function readStore(): Promise<JsonStore> {
    try {
      const raw = await deps.readFile(deps.storePath);
      return JSON.parse(raw) as JsonStore;
    } catch {
      return {};
    }
  }

  async function writeStore(store: JsonStore): Promise<void> {
    await deps.writeFile(deps.storePath, JSON.stringify(store));
  }

  return {
    async get(key: string): Promise<AppResult<string | undefined>> {
      if (!deps.safeStorage.isEncryptionAvailable()) {
        return err(platformSecureStorageUnavailable('Secure storage is unavailable on this system.'));
      }
      if (!isValidSecureStorageKey(key)) {
        return err(platformInvalidUrl('Secure storage key is invalid.'));
      }
      const store = await readStore();
      const encB64 = store[key];
      if (encB64 === undefined) {
        return ok(undefined);
      }
      try {
        const plain = deps.safeStorage.decryptString(Buffer.from(encB64, 'base64'));
        return ok(plain);
      } catch {
        return err(platformIoFailed('Could not read secure storage entry.'));
      }
    },

    async set(key: string, value: string): Promise<AppResult<void>> {
      if (!deps.safeStorage.isEncryptionAvailable()) {
        return err(platformSecureStorageUnavailable('Secure storage is unavailable on this system.'));
      }
      if (!isValidSecureStorageKey(key)) {
        return err(platformInvalidUrl('Secure storage key is invalid.'));
      }
      try {
        const store = await readStore();
        const enc = deps.safeStorage.encryptString(value);
        store[key] = enc.toString('base64');
        await writeStore(store);
        return ok(undefined);
      } catch {
        return err(platformIoFailed('Could not write secure storage entry.'));
      }
    },

    async delete(key: string): Promise<AppResult<void>> {
      if (!deps.safeStorage.isEncryptionAvailable()) {
        return err(platformSecureStorageUnavailable('Secure storage is unavailable on this system.'));
      }
      if (!isValidSecureStorageKey(key)) {
        return err(platformInvalidUrl('Secure storage key is invalid.'));
      }
      const store = await readStore();
      delete store[key];
      await writeStore(store);
      return ok(undefined);
    },
  };
}
