/** Matches `apps/desktop` secure storage validation. */
export const SECURE_STORAGE_KEY_PATTERN = /^[a-zA-Z0-9._:-]{1,120}$/;

export function isValidSecureStorageKey(key: string): boolean {
  return SECURE_STORAGE_KEY_PATTERN.test(key);
}
