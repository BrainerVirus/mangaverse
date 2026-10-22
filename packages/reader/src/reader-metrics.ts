export interface ReaderMetricEvent {
  readonly id: number;
  readonly kind: 'page' | 'prefetch';
  readonly status: 'loaded' | 'cached' | 'failed';
  readonly durationMs: number;
  readonly pageIndex?: number;
  readonly pages?: number;
  readonly bytes?: number;
  readonly timestamp: string;
}

export interface ReaderMetricsSnapshot {
  readonly pageLoads: number;
  readonly pageFailures: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly lastLoadMs: number;
  readonly maxLoadMs: number;
  readonly totalLoadMs: number;
  readonly prefetchRuns: number;
  readonly prefetchPages: number;
  readonly prefetchFailures: number;
  readonly prefetchedBytes: number;
  readonly lastPrefetchMs: number;
  readonly totalPrefetchMs: number;
  readonly events: readonly ReaderMetricEvent[];
}

export interface ReaderMetricsCollector {
  readonly recordPageLoad: (input: {
    readonly status: 'loaded' | 'failed';
    readonly fromCache: boolean;
    readonly durationMs: number;
    readonly pageIndex?: number;
  }) => void;
  readonly recordPrefetch: (input: {
    readonly pages: number;
    readonly failures: number;
    readonly bytes: number;
    readonly durationMs: number;
  }) => void;
  readonly snapshot: () => ReaderMetricsSnapshot;
  readonly reset: () => void;
}

const MAX_EVENTS = 25;

export const EMPTY_READER_METRICS: ReaderMetricsSnapshot = {
  pageLoads: 0,
  pageFailures: 0,
  cacheHits: 0,
  cacheMisses: 0,
  lastLoadMs: 0,
  maxLoadMs: 0,
  totalLoadMs: 0,
  prefetchRuns: 0,
  prefetchPages: 0,
  prefetchFailures: 0,
  prefetchedBytes: 0,
  lastPrefetchMs: 0,
  totalPrefetchMs: 0,
  events: [],
};

/**
 * Mutable counters behind a tiny collector: page loads are low frequency, so a
 * few arithmetic updates per image are cheaper than a React state object and
 * never allocate unless the diagnostics panel is reading a snapshot.
 */
export function createReaderMetricsCollector(): ReaderMetricsCollector {
  const counters = {
    pageLoads: 0,
    pageFailures: 0,
    cacheHits: 0,
    cacheMisses: 0,
    lastLoadMs: 0,
    maxLoadMs: 0,
    totalLoadMs: 0,
    prefetchRuns: 0,
    prefetchPages: 0,
    prefetchFailures: 0,
    prefetchedBytes: 0,
    lastPrefetchMs: 0,
    totalPrefetchMs: 0,
  };
  let events: ReaderMetricEvent[] = [];
  let nextEventId = 1;

  const push = (event: Omit<ReaderMetricEvent, 'id'>): void => {
    events = [{ ...event, id: nextEventId }, ...events].slice(0, MAX_EVENTS);
    nextEventId += 1;
  };

  return {
    recordPageLoad: ({ status, fromCache, durationMs, pageIndex }) => {
      const duration = Math.max(0, Math.round(durationMs));
      counters.lastLoadMs = duration;
      counters.totalLoadMs += duration;
      counters.maxLoadMs = Math.max(counters.maxLoadMs, duration);
      if (status === 'failed') {
        counters.pageFailures += 1;
      } else {
        counters.pageLoads += 1;
        if (fromCache) counters.cacheHits += 1;
        else counters.cacheMisses += 1;
      }
      push({
        kind: 'page',
        status: status === 'failed' ? 'failed' : fromCache ? 'cached' : 'loaded',
        durationMs: duration,
        ...(pageIndex !== undefined ? { pageIndex } : {}),
        timestamp: new Date().toISOString(),
      });
    },
    recordPrefetch: ({ pages, failures, bytes, durationMs }) => {
      const duration = Math.max(0, Math.round(durationMs));
      counters.prefetchRuns += 1;
      counters.prefetchPages += pages;
      counters.prefetchFailures += failures;
      counters.prefetchedBytes += Math.max(0, bytes);
      counters.lastPrefetchMs = duration;
      counters.totalPrefetchMs += duration;
      push({
        kind: 'prefetch',
        status: failures > 0 && pages === failures ? 'failed' : 'loaded',
        durationMs: duration,
        pages,
        bytes: Math.max(0, bytes),
        timestamp: new Date().toISOString(),
      });
    },
    snapshot: () => ({ ...counters, events: [...events] }),
    reset: () => {
      for (const key of Object.keys(counters) as (keyof typeof counters)[]) {
        counters[key] = 0;
      }
      events = [];
      nextEventId = 1;
    },
  };
}
