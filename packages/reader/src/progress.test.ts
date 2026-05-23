import { describe, it, expect } from 'vitest';
import {
  createProgressEvent,
  shouldPersistProgress,
} from './progress';
import type { ReaderProgressEvent } from './types';

describe('createProgressEvent', () => {
  it('should create progress event with page index', () => {
    const event = createProgressEvent('ch1', 'm1', 3, 10);

    expect(event.chapterId).toBe('ch1');
    expect(event.mangaId).toBe('m1');
    expect(event.pageIndex).toBe(3);
  });

  it('should calculate readPercent correctly', () => {
    const event = createProgressEvent('ch1', 'm1', 4, 10);

    expect(event.readPercent).toBe(50);
  });

  it('should mark completed when on last page', () => {
    const event = createProgressEvent('ch1', 'm1', 9, 10);

    expect(event.completed).toBe(true);
  });

  it('should not mark completed before last page', () => {
    const event = createProgressEvent('ch1', 'm1', 5, 10);

    expect(event.completed).toBe(false);
  });

  it('should include timestamp', () => {
    const event = createProgressEvent('ch1', 'm1', 0, 10);

    expect(event.timestamp).toBeDefined();
  });

  it('should handle single page chapter', () => {
    const event = createProgressEvent('ch1', 'm1', 0, 1);

    expect(event.readPercent).toBe(100);
    expect(event.completed).toBe(true);
  });
});

describe('shouldPersistProgress', () => {
  it('should persist on page change', () => {
    const previous: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 2,
      readPercent: 30,
      completed: false,
      timestamp: new Date().toISOString(),
    };
    const next: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 3,
      readPercent: 40,
      completed: false,
      timestamp: new Date().toISOString(),
    };

    expect(shouldPersistProgress(previous, next, {})).toBe(true);
  });

  it('should not persist for same page', () => {
    const previous: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 3,
      readPercent: 40,
      completed: false,
      timestamp: new Date().toISOString(),
    };
    const next: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 3,
      readPercent: 40,
      completed: false,
      timestamp: new Date().toISOString(),
    };

    expect(shouldPersistProgress(previous, next, {})).toBe(false);
  });

  it('should persist on chapter change', () => {
    const previous: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 9,
      readPercent: 100,
      completed: true,
      timestamp: new Date().toISOString(),
    };
    const next: ReaderProgressEvent = {
      chapterId: 'ch2',
      mangaId: 'm1',
      pageIndex: 0,
      readPercent: 0,
      completed: false,
      timestamp: new Date().toISOString(),
    };

    expect(shouldPersistProgress(previous, next, {})).toBe(true);
  });

  it('should respect minPagesBetweenPersists policy', () => {
    const previous: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 2,
      readPercent: 30,
      completed: false,
      timestamp: new Date().toISOString(),
    };
    const next: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 3,
      readPercent: 40,
      completed: false,
      timestamp: new Date().toISOString(),
    };

    const shouldPersist = shouldPersistProgress(previous, next, { minPagesBetweenPersists: 5 });

    expect(shouldPersist).toBe(false);
  });

  it('should persist when exceeding minPagesBetweenPersists', () => {
    const previous: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 0,
      readPercent: 0,
      completed: false,
      timestamp: new Date().toISOString(),
    };
    const next: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 7,
      readPercent: 70,
      completed: false,
      timestamp: new Date().toISOString(),
    };

    const shouldPersist = shouldPersistProgress(previous, next, { minPagesBetweenPersists: 5 });

    expect(shouldPersist).toBe(true);
  });

  it('should always persist on completion', () => {
    const previous: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 9,
      readPercent: 90,
      completed: false,
      timestamp: new Date().toISOString(),
    };
    const next: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 9,
      readPercent: 100,
      completed: true,
      timestamp: new Date().toISOString(),
    };

    expect(shouldPersistProgress(previous, next, {})).toBe(true);
  });
});
