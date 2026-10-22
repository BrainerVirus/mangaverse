import { useCallback, useState } from 'react';
import {
  createReaderMetricsCollector,
  EMPTY_READER_METRICS,
  type ReaderMetricsSnapshot,
} from '../reader-metrics.js';

export interface ReaderPageMetric {
  readonly pageIndex: number;
  readonly status: 'loaded' | 'failed';
  readonly fromCache: boolean;
  readonly durationMs: number;
}

export interface ReaderPrefetchMetric {
  readonly pages: number;
  readonly failures: number;
  readonly bytes: number;
  readonly durationMs: number;
}

/**
 * Diagnostics counters live outside the reader state: they change on every
 * page load and must only re-render when the setting asks for them.
 */
export function useReaderDiagnostics(enabled: boolean): {
  readonly snapshot: ReaderMetricsSnapshot;
  readonly recordPageLoad: (metric: ReaderPageMetric) => void;
  readonly recordPrefetch: (metric: ReaderPrefetchMetric) => void;
  readonly clear: () => void;
} {
  const [collector] = useState(createReaderMetricsCollector);
  const [snapshot, setSnapshot] = useState<ReaderMetricsSnapshot>(EMPTY_READER_METRICS);

  const recordPageLoad = useCallback(
    (metric: ReaderPageMetric) => {
      if (!enabled) return;
      collector.recordPageLoad(metric);
      setSnapshot(collector.snapshot());
    },
    [collector, enabled],
  );
  const recordPrefetch = useCallback(
    (metric: ReaderPrefetchMetric) => {
      if (!enabled) return;
      collector.recordPrefetch(metric);
      setSnapshot(collector.snapshot());
    },
    [collector, enabled],
  );
  const clear = useCallback(() => {
    collector.reset();
    setSnapshot(EMPTY_READER_METRICS);
  }, [collector]);

  return { snapshot, recordPageLoad, recordPrefetch, clear };
}
