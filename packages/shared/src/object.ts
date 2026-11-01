/**
 * The shape every validator starts from: an object that is neither `null` nor an
 * array. Kept apart from the domain modules so boundary checks share one guard
 * instead of a local copy each.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
