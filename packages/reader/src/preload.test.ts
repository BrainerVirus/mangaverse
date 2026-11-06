import { describe, it, expect } from 'vitest';
import { toChapterPageId } from '@app/shared';
import { createPreloadPlan, recordPageLoadResult } from './preload';
import type { PageLoadResult, ReaderPage } from './types';

const mockPages: ReaderPage[] = Array.from({ length: 10 }, (_, i) => ({
  id: toChapterPageId(`p${i}`),
  index: i,
  image: { url: `http://example.com/${i}.jpg` },
}));

const order = (plan: ReturnType<typeof createPreloadPlan>): number[] =>
  plan.items.map((item) => item.pageIndex);

describe('createPreloadPlan', () => {
  it('Given data saver, When planned, Then the plan is empty with or without the active page', () => {
    for (const includeActive of [true, false]) {
      const plan = createPreloadPlan(mockPages, 5, 4, false, {
        includeActive,
        preloadBehind: 2,
        dataSaver: true,
      });
      expect(plan.items).toEqual([]);
      expect(plan.maxPreload).toBe(0);
    }
    expect(order(createPreloadPlan(mockPages, 5, 1, false, { dataSaver: false }))).toEqual([
      5, 4, 6,
    ]);
  });

  it('Given the first page, When planned, Then the active page comes first and only ahead pages follow', () => {
    const plan = createPreloadPlan(mockPages, 0, 2, false);

    expect(order(plan)).toEqual([0, 1, 2]);
    expect(plan.items[0]!.priority).toBeGreaterThan(plan.items[1]!.priority);
  });

  it('Given a mid-chapter page, When planned, Then both neighbours precede the far-ahead pages', () => {
    const plan = createPreloadPlan(mockPages, 5, 3, false);

    expect(order(plan)).toEqual([5, 4, 6, 7, 8]);
    const priorities = plan.items.map((item) => item.priority);
    for (let index = 1; index < priorities.length; index += 1) {
      expect(priorities[index - 1]!).toBeGreaterThan(priorities[index]!);
    }
  });

  it('Given a configured behind budget, When planned, Then backward pages are warm too', () => {
    const plan = createPreloadPlan(mockPages, 5, 2, false, { preloadBehind: 2 });

    expect(order(plan)).toEqual([5, 4, 6, 7, 3]);
  });

  it('Given the prefetch sweep, When the active page is excluded, Then only the warm pages remain', () => {
    const plan = createPreloadPlan(mockPages, 5, 2, false, { includeActive: false });

    expect(order(plan)).toEqual([4, 6, 7]);
  });

  it('Given low memory, When planned, Then only the active page and one ahead are planned', () => {
    const plan = createPreloadPlan(mockPages, 0, 10, true);

    expect(plan.maxPreload).toBe(1);
    expect(order(plan)).toEqual([0, 1]);
  });

  it('Given the last page, When planned, Then the previous page is warmed instead of nothing', () => {
    const plan = createPreloadPlan(mockPages, 9, 3, false);

    expect(order(plan)).toEqual([9, 8]);
  });

  it('Given a page index outside the chapter, When planned, Then the plan clamps to a real page', () => {
    expect(order(createPreloadPlan(mockPages, -3, 2, false))).toEqual([0, 1, 2]);
    expect(order(createPreloadPlan(mockPages, 99, 2, false))).toEqual([9, 8]);
  });

  it('Given an empty chapter, When planned, Then the plan is empty', () => {
    expect(createPreloadPlan([], 0, 4, false).items).toEqual([]);
  });

  it('should include url in preload items', () => {
    const plan = createPreloadPlan(mockPages, 0, 2, false);

    expect(plan.items[0]!.url).toContain('example.com');
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
    const afterSuccess = recordPageLoadResult(
      successResult,
      mockPages,
      0,
      [2],
      3,
      afterFail.retryState,
    );

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
