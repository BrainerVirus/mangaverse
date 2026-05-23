import { useId } from 'react';
import { Skeleton } from './ui/skeleton.js';

type LoadingStateType = 'grid' | 'list' | 'detail';

export interface LoadingStateProps {
  type: LoadingStateType;
  count?: number;
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="shrink-0">
        <Skeleton className="h-80 w-56 rounded-[var(--radius-box)]" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64 rounded" />
        <Skeleton className="h-4 w-48 rounded" />
        <Skeleton className="h-4 w-32 rounded" />
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-10 w-24 rounded-[var(--radius-btn)]" />
          <Skeleton className="h-10 w-24 rounded-[var(--radius-btn)]" />
        </div>
        <Skeleton className="mt-4 h-24 w-full rounded" />
      </div>
    </div>
  );
}

export function LoadingState({ type, count = 1 }: LoadingStateProps) {
  const itemCount = type === 'grid' ? 10 : type === 'list' ? 8 : 1;
  const actualCount = count > 0 ? count : itemCount;
  const baseId = useId();
  return (
    <div className="w-full">
      {type === 'grid' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: actualCount }).map((_, i) => (
            <div key={`${baseId}-${i}`} className="flex flex-col gap-2">
              <Skeleton className="aspect-[3/4] w-full rounded-[var(--radius-box)]" />
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
            </div>
          ))}
        </div>
      )}
      {type === 'list' && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: actualCount }).map((_, i) => (
            <div key={`${baseId}-list-${i}`} className="flex gap-4 rounded-[var(--radius-box)] border border-[var(--border)] p-3">
              <Skeleton className="h-20 w-14 shrink-0 rounded-[var(--radius-control)]" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-48 rounded" />
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}
      {type === 'detail' && <DetailSkeleton />}
    </div>
  );
}