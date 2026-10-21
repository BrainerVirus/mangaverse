/**
 * Minimal in-memory Web Locks manager for tests. Node only gained
 * `navigator.locks` in 24.5 and jsdom has none, so the cache tests cannot rely
 * on the runtime's implementation. Semantics match the spec subset the cache
 * uses: shared/exclusive compatibility, `ifAvailable`, and a request that stays
 * pending until the callback's promise settles.
 */
type FakeLockMode = 'shared' | 'exclusive';

interface HeldLock {
  readonly name: string;
  readonly mode: FakeLockMode;
}

interface WaitingRequest {
  readonly name: string;
  readonly mode: FakeLockMode;
  readonly grant: () => void;
}

export interface FakeWebLocks {
  readonly locks: {
    query(): Promise<{ held: { name: string; mode: FakeLockMode }[]; pending: unknown[] }>;
    request(
      name: string,
      options: { readonly mode?: FakeLockMode; readonly ifAvailable?: boolean },
      callback: () => Promise<void> | void,
    ): Promise<unknown>;
  };
  /** Simulates another tab holding a lock for its lifetime; call to release. */
  hold(name: string, mode?: FakeLockMode): () => void;
}

function createFakeWebLocks(): FakeWebLocks {
  const held: HeldLock[] = [];
  const waiting: WaitingRequest[] = [];

  const conflicts = (name: string, mode: FakeLockMode): boolean =>
    held.some((lock) => lock.name === name && (lock.mode === 'exclusive' || mode === 'exclusive'));

  const drain = (): void => {
    for (let index = 0; index < waiting.length;) {
      const waiter = waiting[index]!;
      if (conflicts(waiter.name, waiter.mode)) {
        index += 1;
        continue;
      }
      waiting.splice(index, 1);
      waiter.grant();
    }
  };

  const release = (lock: HeldLock): void => {
    const index = held.indexOf(lock);
    if (index === -1) return;
    held.splice(index, 1);
    drain();
  };

  const hold = (name: string, mode: FakeLockMode = 'shared'): (() => void) => {
    const lock: HeldLock = { name, mode };
    held.push(lock);
    return () => release(lock);
  };

  return {
    hold,
    locks: {
      query: async () => ({ held: held.map((lock) => ({ ...lock })), pending: [] }),
      request: (name, options, callback) =>
        new Promise<unknown>((resolve, reject) => {
          const mode = options.mode ?? 'exclusive';
          const grant = (): void => {
            const lock: HeldLock = { name, mode };
            held.push(lock);
            let settled = false;
            const settle = (error?: unknown): void => {
              if (settled) return;
              settled = true;
              release(lock);
              if (error === undefined) resolve(undefined);
              else reject(error);
            };
            try {
              Promise.resolve(callback()).then(
                () => settle(),
                (error: unknown) => settle(error),
              );
            } catch (error) {
              settle(error);
            }
          };

          if (!conflicts(name, mode)) {
            grant();
            return;
          }
          if (options.ifAvailable === true) {
            resolve(undefined);
            return;
          }
          waiting.push({ name, mode, grant });
        }),
    },
  };
}

/** Installs `fake` as `navigator.locks`; call `restore` in `afterEach`. */
export function installFakeWebLocks(fake: FakeWebLocks = createFakeWebLocks()): {
  readonly fake: FakeWebLocks;
  readonly restore: () => void;
} {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { locks: fake.locks },
  });

  return {
    fake,
    restore: () => {
      if (original === undefined) {
        Reflect.deleteProperty(globalThis, 'navigator');
      } else {
        Object.defineProperty(globalThis, 'navigator', original);
      }
    },
  };
}

/** Installs a navigator without Web Locks, for fail-safe tests. */
export function installNoWebLocks(): { readonly restore: () => void } {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {},
  });
  return {
    restore: () => {
      if (original === undefined) {
        Reflect.deleteProperty(globalThis, 'navigator');
      } else {
        Object.defineProperty(globalThis, 'navigator', original);
      }
    },
  };
}
