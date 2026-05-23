import { describe, it, expect } from 'vitest';
import {
  createPreloadPlan,
  createDecodeQueue,
  recordPageLoadResult,
} from './preload';
import type { PageLoadResult } from './types';

const mockPages = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i}`,
  index: i,
  image: { url: `http://example.com/${i}.jpg` },
}));

describe('createPreloadPlan', () => {
  it('should create preload plan with correct priorities', () => {
    const pages = mockPages;
    const plan = createPreloadPlan(pages, 0, 2, false);

    expect(plan.items).toHaveLength(2);
    expect(plan.items[0].pageIndex).toBe(1);
    expect(plan.items[1].pageIndex).toBe(2);
    expect(plan.items[0].priority).toBeGreaterThan(plan.items[1].priority);
  });

  it('should use preload count from settings', () => {
    const pages = mockPages;
    const plan = createPreloadPlan(pages, 3, 5, false);

    expect(plan.items).toHaveLength(5);
  });

  it('should cap at 1 in low memory mode', () => {
    const pages = mockPages;
    const plan = createPreloadPlan(pages, 0, 10, true);

    expect(plan.maxPreload).toBe(1);
    expect(plan.items).toHaveLength(1);
  });

  it('should not include pages behind active page', () => {
    const pages = mockPages;
    const plan = createPreloadPlan(pages, 5, 3, false);

    for (const item of plan.items) {
      expect(item.pageIndex).toBeGreaterThan(5);
    }
  });

  it('should handle being at last page', () => {
    const pages = mockPages;
    const plan = createPreloadPlan(pages, 9, 3, false);

    expect(plan.items).toHaveLength(0);
  });

  it('should include url in preload items', () => {
    const pages = mockPages;
    const plan = createPreloadPlan(pages, 0, 2, false);

    expect(plan.items[0].url).toBeDefined();
    expect(plan.items[0].url).toContain('example.com');
  });
});

describe('createDecodeQueue', () => {
  it('should create priority-ordered decode queue', () => {
    const pages = mockPages;
    const queue = createDecodeQueue(pages, 0, 3, false);

    expect(queue.items).toHaveLength(3);
    expect(queue.totalPages).toBe(10);
  });

  it('should order by priority (closer pages first)', () => {
    const pages = mockPages;
    const queue = createDecodeQueue(pages, 5, 5, false);

    const priorities = queue.items.map(item => item.priority);
    for (let i = 1; i < priorities.length; i++) {
      expect(priorities[i - 1]).toBeGreaterThanOrEqual(priorities[i]);
    }
  });

  it('should cap queue size in low memory mode', () => {
    const pages = mockPages;
    const queue = createDecodeQueue(pages, 0, 10, true);

    expect(queue.items.length).toBeLessThanOrEqual(2);
  });

  it('should include retry count in queue items', () => {
    const pages = mockPages;
    const queue = createDecodeQueue(pages, 0, 3, false);

    expect(queue.items[0].retryCount).toBe(0);
  });
});

describe('recordPageLoadResult', () => {
  it('should return success result', () => {
    const result: PageLoadResult = {
      pageIndex: 1,
      success: true,
      bytesLoaded: 50000,
    };

    const updated = recordPageLoadResult(result, mockPages, 0, [], 3, {});

    expect(updated.failedPages).toHaveLength(0);
  });

  it('should record failed page', () => {
    const result: PageLoadResult = {
      pageIndex: 2,
      success: false,
      errorCode: 'reader.image.failed',
    };

    const updated = recordPageLoadResult(result, mockPages, 0, [], 3, {});

    expect(updated.failedPages).toContain(2);
  });

  it('should not retry beyond max retries', () => {
    const result: PageLoadResult = {
      pageIndex: 2,
      success: false,
      errorCode: 'reader.image.failed',
    };

    const updated = recordPageLoadResult(result, mockPages, 0, [2], 3, { 2: 3 });

    expect(updated.failedPages).toContain(2);
    expect(updated.preloadQueue).not.toContain(2);
  });

  it('should produce deterministic queue ordering', () => {
    const result1: PageLoadResult = { pageIndex: 1, success: true };
    const result2: PageLoadResult = { pageIndex: 2, success: true };

    const updated1 = recordPageLoadResult(result1, mockPages, 0, [], 3, {});
    const updated2 = recordPageLoadResult(result2, mockPages, 0, [], 3, {});

    expect(updated1.preloadQueue.length).toBe(updated2.preloadQueue.length);
  });

  it('should increment retry count on repeated failure', () => {
    const result: PageLoadResult = {
      pageIndex: 2,
      success: false,
      errorCode: 'reader.image.failed',
    };

    const updated1 = recordPageLoadResult(result, mockPages, 0, [], 3, {});
    const updated2 = recordPageLoadResult(result, mockPages, 0, [2], 3, updated1.retryState);

    expect(updated2.retryState).toHaveProperty('2');
    expect(updated2.retryState[2]).toBe(2);
    expect(updated2.preloadQueue).toContain(2);
  });

  it('should clear retry state on successful load', () => {
    const failResult: PageLoadResult = {
      pageIndex: 2,
      success: false,
      errorCode: 'reader.image.failed',
    };
    const successResult: PageLoadResult = {
      pageIndex: 2,
      success: true,
    };

    const afterFail = recordPageLoadResult(failResult, mockPages, 0, [], 3, {});
    const afterSuccess = recordPageLoadResult(successResult, mockPages, 0, [2], 3, afterFail.retryState);

    expect(afterSuccess.retryState).not.toHaveProperty('2');
    expect(afterSuccess.failedPages).not.toContain(2);
  });

  it('should stop scheduling retries after maxRetries attempts', () => {
    const result: PageLoadResult = {
      pageIndex: 2,
      success: false,
      errorCode: 'reader.image.failed',
    };

    const after1 = recordPageLoadResult(result, mockPages, 0, [], 2, {});
    const after2 = recordPageLoadResult(result, mockPages, 0, [2], 2, after1.retryState);
    const after3 = recordPageLoadResult(result, mockPages, 0, [2], 2, after2.retryState);

    expect(after1.retryState[2]).toBe(1);
    expect(after1.preloadQueue).toContain(2);
    expect(after2.retryState[2]).toBe(2);
    expect(after2.preloadQueue).not.toContain(2);
    expect(after3.retryState[2]).toBe(2);
    expect(after3.preloadQueue).not.toContain(2);
  });
});