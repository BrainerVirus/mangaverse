/**
 * TanStack Query cache timing tuned for local-first data in apps/web.
 * Provider-backed queries should use shorter stale windows in future slices.
 */
export const QUERY_STALE_TIMES = {
  /** Local SQLite library rows — stable until explicit library mutations. */
  library: 5 * 60 * 1000,
  /** Search mixes local history with provider aggregation. */
  search: 60 * 1000,
  /** App and reader settings persisted in SQLite. */
  settings: 10 * 60 * 1000,
} as const;

export const QUERY_GC_TIMES = {
  library: 30 * 60 * 1000,
  search: 10 * 60 * 1000,
  settings: 60 * 60 * 1000,
} as const;

export type QueryFeatureDomain = keyof typeof QUERY_STALE_TIMES;
