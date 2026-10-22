import { describe, expect, it } from 'vitest';
import { createReaderMetricsCollector } from './reader-metrics.js';

describe('createReaderMetricsCollector', () => {
  it('Given page loads, When a cache hit and a network load land, Then counts and timings separate them', () => {
    const metrics = createReaderMetricsCollector();
    metrics.recordPageLoad({ status: 'loaded', fromCache: true, durationMs: 12, pageIndex: 0 });
    metrics.recordPageLoad({ status: 'loaded', fromCache: false, durationMs: 250, pageIndex: 1 });
    metrics.recordPageLoad({ status: 'failed', fromCache: false, durationMs: 80, pageIndex: 2 });

    expect(metrics.snapshot()).toMatchObject({
      pageLoads: 2,
      pageFailures: 1,
      cacheHits: 1,
      cacheMisses: 1,
      lastLoadMs: 80,
      maxLoadMs: 250,
      totalLoadMs: 342,
    });
  });

  it('Given prefetch runs, When they complete, Then pages, bytes and failures are counted', () => {
    const metrics = createReaderMetricsCollector();
    metrics.recordPrefetch({ pages: 4, failures: 1, bytes: 2048, durationMs: 300 });
    metrics.recordPrefetch({ pages: 1, failures: 0, bytes: 512, durationMs: 20 });

    expect(metrics.snapshot()).toMatchObject({
      prefetchRuns: 2,
      prefetchPages: 5,
      prefetchFailures: 1,
      prefetchedBytes: 2560,
      lastPrefetchMs: 20,
      totalPrefetchMs: 320,
    });
  });

  it('Given events and a reset, When cleared, Then counters and the timeline start empty', () => {
    const metrics = createReaderMetricsCollector();
    metrics.recordPageLoad({ status: 'loaded', fromCache: false, durationMs: 10 });
    for (let index = 0; index < 30; index += 1) {
      metrics.recordPrefetch({ pages: 1, failures: 0, bytes: 1, durationMs: 1 });
    }
    const before = metrics.snapshot();
    expect(before.events).toHaveLength(25);
    expect(before.events[0]?.kind).toBe('prefetch');

    metrics.reset();
    expect(metrics.snapshot()).toMatchObject({
      pageLoads: 0,
      pageFailures: 0,
      prefetchRuns: 0,
      events: [],
    });
  });
});
