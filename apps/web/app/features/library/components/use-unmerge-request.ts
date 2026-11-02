import { useState } from 'react';
import type { UnmergeMappingPreview } from '@app/db';
import type { ProviderMappingId } from '@app/shared';

export interface UseUnmergeRequestInput {
  loadPreview?: (mappingId: ProviderMappingId) => Promise<UnmergeMappingPreview | undefined>;
  onUnmerge?: (mappingId: ProviderMappingId) => Promise<void>;
}

/** Preview + confirm state for splitting one provider source out of a title. */
export function useUnmergeRequest({ loadPreview, onUnmerge }: UseUnmergeRequestInput) {
  const [openMappingId, setOpenMappingId] = useState<ProviderMappingId | undefined>();
  const [preview, setPreview] = useState<UnmergeMappingPreview | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function open(mappingId: ProviderMappingId): Promise<void> {
    setOpenMappingId(mappingId);
    setPreview(undefined);
    setError(undefined);
    if (loadPreview === undefined) {
      setError('Split preview is unavailable.');
      return;
    }
    setIsLoading(true);
    // react-doctor-disable-next-line react-hooks-js/todo -- ruling: web-compiler-skip-moved-library: moved unchanged; the compiler skips this function for its try/finally (panicThreshold none), the behaviour it had uncompiled in @app/library.
    try {
      const loaded = await loadPreview(mappingId);
      if (loaded === undefined) {
        setError('That provider source no longer exists.');
        return;
      }
      setPreview(loaded);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not build the split preview.');
    } finally {
      setIsLoading(false);
    }
  }

  function reset(): void {
    setOpenMappingId(undefined);
    setPreview(undefined);
    setError(undefined);
  }

  async function confirm(mappingId: ProviderMappingId): Promise<void> {
    if (onUnmerge === undefined) return;
    await onUnmerge(mappingId);
  }

  return {
    openMappingId,
    preview,
    isLoading,
    error,
    isAvailable: loadPreview !== undefined && onUnmerge !== undefined,
    open,
    reset,
    confirm,
  };
}
