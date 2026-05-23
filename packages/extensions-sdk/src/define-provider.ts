import type { ProviderContract } from './contract-types.js';

export function defineProvider(provider: ProviderContract): ProviderContract {
  return Object.freeze({ ...provider });
}
