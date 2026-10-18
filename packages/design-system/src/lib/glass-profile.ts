export interface GlassProfileInput {
  hardwareConcurrency?: number | undefined;
  deviceMemory?: number | undefined;
  reducedMotion?: boolean | undefined;
}

/**
 * DESIGN.md §2.5 — the low-end profile. Four cores, 4 GB of memory or a reduced-motion
 * preference put the root on `data-glass="cheap"`, which resolves every glass tier to its
 * opaque token. The shell applies the attribute; this is the predicate.
 */
export function resolveGlassProfile(input: GlassProfileInput = {}): 'cheap' | 'full' {
  const lowEnd =
    (input.hardwareConcurrency ?? Infinity) <= 4 || (input.deviceMemory ?? Infinity) <= 4;
  return input.reducedMotion === true || lowEnd ? 'cheap' : 'full';
}
