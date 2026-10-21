/** The subset of the Web Locks API the cache uses. */
interface RequestedLock {
  readonly name: string;
  readonly mode: 'shared' | 'exclusive';
}

export interface LockManagerLike {
  query(): Promise<{ readonly held?: readonly { readonly name?: string }[] }>;
  request<T>(
    name: string,
    options: { readonly mode: 'shared' | 'exclusive'; readonly ifAvailable?: boolean },
    callback: (lock: RequestedLock | null) => T | Promise<T>,
  ): Promise<T>;
}

export function resolveLockManager(): LockManagerLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const manager = Reflect.get(navigator, 'locks') as LockManagerLike | undefined;
  if (typeof manager?.request !== 'function' || typeof manager.query !== 'function') {
    return undefined;
  }
  return manager;
}
