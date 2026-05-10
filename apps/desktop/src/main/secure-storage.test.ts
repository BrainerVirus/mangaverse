import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSecureStorageModel } from './secure-storage.js';

describe('createSecureStorageModel', () => {
  it('stores and retrieves encrypted values with fake safeStorage', async () => {
    const storePath = join(tmpdir(), `mv-secure-${Date.now()}.json`);
    const map = new Map<string, string>();
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf8'),
      decryptString: (buf: Buffer) => buf.toString('utf8').replace(/^enc:/, ''),
    };
    const model = createSecureStorageModel({
      safeStorage,
      storePath,
      readFile: async (p) => {
        const v = map.get(p);
        if (v === undefined) throw new Error('missing');
        return v;
      },
      writeFile: async (p, data) => {
        map.set(p, data);
      },
    });

    const setR = await model.set('token.auth', 'secret-value');
    expect(setR.ok).toBe(true);
    const getR = await model.get('token.auth');
    expect(getR.ok && getR.value).toBe('secret-value');
  });

  it('deletes existing values', async () => {
    const storePath = join(tmpdir(), `mv-secure-del-${Date.now()}.json`);
    const map = new Map<string, string>();
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (v: string) => Buffer.from(v, 'utf8'),
      decryptString: (b: Buffer) => b.toString('utf8'),
    };
    const model = createSecureStorageModel({
      safeStorage,
      storePath,
      readFile: async (p) => {
        const v = map.get(p);
        if (v === undefined) throw new Error('missing');
        return v;
      },
      writeFile: async (p, data) => {
        map.set(p, data);
      },
    });
    await model.set('k', 'v');
    await model.delete('k');
    const getR = await model.get('k');
    expect(getR.ok && getR.value).toBeUndefined();
  });

  it('rejects invalid keys', async () => {
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (v: string) => Buffer.from(v),
      decryptString: (b: Buffer) => b.toString('utf8'),
    };
    const model = createSecureStorageModel({
      safeStorage,
      storePath: '/tmp/x',
      readFile: async () => '{}',
      writeFile: async () => {},
    });
    const r = await model.get('bad key');
    expect(r.ok).toBe(false);
  });

  it('returns unsupported when encryption is unavailable', async () => {
    const safeStorage = {
      isEncryptionAvailable: () => false,
      encryptString: (_v: string) => Buffer.alloc(0),
      decryptString: (_b: Buffer) => '',
    };
    const model = createSecureStorageModel({
      safeStorage,
      storePath: '/tmp/x',
      readFile: async () => '{}',
      writeFile: async () => {},
    });
    const r = await model.set('k', 'v');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('platform.secure-storage-unavailable');
    }
  });

  it('does not include secret values in errors', async () => {
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: () => {
        throw new Error('SECRET_PAYLOAD');
      },
      decryptString: (_b: Buffer) => '',
    };
    const model = createSecureStorageModel({
      safeStorage,
      storePath: '/tmp/x',
      readFile: async () => '{}',
      writeFile: async () => {},
    });
    const r = await model.set('k', 'v');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(JSON.stringify(r.error)).not.toContain('SECRET');
    }
  });
});
