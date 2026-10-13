import type { ReaderProgressEvent } from './types';

export interface ProgressPolicy {
  minPagesBetweenPersists?: number;
}

export function createProgressEvent(
  chapterId: string,
  mangaId: string,
  pageIndex: number,
  totalPages: number
): ReaderProgressEvent {
  const readPercent = totalPages > 0
    ? Math.round(((pageIndex + 1) / totalPages) * 100)
    : 100;
  const completed = pageIndex >= totalPages - 1;

  return {
    chapterId,
    mangaId,
    pageIndex,
    readPercent,
    completed,
    timestamp: new Date().toISOString(),
  };
}

export interface UnmountCheckpointPolicy {
  initialPageIndex: number;
  lifetimeMs: number;
  debounceMs: number;
}

/**
 * Unmount checkpoint guard: a router "blip" instance (mount+unmount around a
 * transition) or a user pressing Back right after opening must not persist its
 * initial page over newer progress from another instance.
 */
export function shouldCheckpointOnUnmount(
  pendingPageIndex: number,
  policy: UnmountCheckpointPolicy
): boolean {
  return pendingPageIndex !== policy.initialPageIndex || policy.lifetimeMs >= policy.debounceMs;
}

export function shouldPersistProgress(
  previous: ReaderProgressEvent,
  next: ReaderProgressEvent,
  policy: ProgressPolicy
): boolean {
  if (previous.chapterId !== next.chapterId) {
    return true;
  }

  if (!previous.completed && next.completed) {
    return true;
  }

  if (previous.pageIndex === next.pageIndex) {
    return false;
  }

  const minPages = policy.minPagesBetweenPersists ?? 0;
  if (minPages > 0) {
    const pagesSinceLastPersist = next.pageIndex - previous.pageIndex;
    if (pagesSinceLastPersist < minPages) {
      return false;
    }
  }

  return true;
}