import type { CacheChapterRef } from './cache-maintenance.js';

/**
 * Long enough for a BroadcastChannel round trip even under load, short enough
 * not to stall a background sweep. A tab that misses the window is not seen.
 */
const OPEN_CHAPTER_PROBE_TIMEOUT_MS = 150;

const OPEN_CHAPTER_CHANNEL = 'mangaverse:open-chapters';

export interface OpenChapterRegistryOptions {
  readonly channelName?: string;
  /** Wall-clock window for collecting probe replies. */
  readonly probeTimeoutMs?: number;
}

type OpenChapterMessage =
  | { readonly type: 'probe' }
  | { readonly type: 'open'; readonly chapter: CacheChapterRef };

export interface OpenChapterRegistry {
  setOpenChapter(chapter: CacheChapterRef | undefined): void;
  listOpenChapters(): Promise<readonly CacheChapterRef[]>;
}

function chapterKey(chapter: CacheChapterRef): string {
  return `${chapter.providerId}\u0000${chapter.mangaId}\u0000${chapter.chapterId}`;
}

function isChapterShape(value: unknown): value is CacheChapterRef {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (
    typeof Reflect.get(value, 'providerId') === 'string' &&
    typeof Reflect.get(value, 'mangaId') === 'string' &&
    typeof Reflect.get(value, 'chapterId') === 'string'
  );
}

/**
 * Best-effort cross-tab view of open reader chapters. A sweep probes the live
 * tabs right before evicting rather than keeping a shared registry, so a crashed
 * tab cannot protect a chapter forever and no lock is involved. A runtime
 * without BroadcastChannel (SSR, older test environments) only protects the
 * chapter passed to the sweep by this tab.
 */
export function createOpenChapterRegistry(
  options: OpenChapterRegistryOptions = {},
): OpenChapterRegistry {
  const channelName = options.channelName ?? OPEN_CHAPTER_CHANNEL;
  const probeTimeoutMs = options.probeTimeoutMs ?? OPEN_CHAPTER_PROBE_TIMEOUT_MS;
  let self: CacheChapterRef | undefined;
  let channel: BroadcastChannel | null | undefined;
  const collectors = new Set<Map<string, CacheChapterRef>>();

  const openChannel = (): BroadcastChannel | null => {
    if (channel !== undefined) {
      return channel;
    }
    if (typeof BroadcastChannel === 'undefined') {
      channel = null;
      return channel;
    }
    try {
      const opened = new BroadcastChannel(channelName);
      // Node's channel keeps the event loop alive; browsers have no such call.
      (opened as BroadcastChannel & { unref?: () => void }).unref?.();
      opened.onmessage = (event: MessageEvent<unknown>) => {
        const message = event.data;
        if (typeof message !== 'object' || message === null) {
          return;
        }
        const type = Reflect.get(message, 'type');
        if (type === 'probe') {
          if (self !== undefined) {
            try {
              opened.postMessage({ type: 'open', chapter: self } satisfies OpenChapterMessage);
            } catch {
              // A channel closing during teardown cannot answer; nothing to report.
            }
          }
          return;
        }
        if (type !== 'open') {
          return;
        }
        const chapter = Reflect.get(message, 'chapter');
        if (!isChapterShape(chapter)) {
          return;
        }
        for (const collector of collectors) {
          collector.set(chapterKey(chapter), chapter);
        }
      };
      channel = opened;
    } catch {
      channel = null;
    }
    return channel;
  };

  return {
    setOpenChapter(chapter) {
      self = chapter;
      if (chapter !== undefined) {
        openChannel();
      }
    },
    async listOpenChapters() {
      const found = new Map<string, CacheChapterRef>();
      if (self !== undefined) {
        found.set(chapterKey(self), self);
      }

      const opened = openChannel();
      if (opened === null) {
        return [...found.values()];
      }

      collectors.add(found);
      try {
        try {
          opened.postMessage({ type: 'probe' } satisfies OpenChapterMessage);
        } catch {
          // Probing is best-effort; without it only this tab's chapter is protected.
          return [...found.values()];
        }
        await new Promise<void>((resolve) => setTimeout(resolve, probeTimeoutMs));
      } finally {
        collectors.delete(found);
      }
      return [...found.values()];
    },
  };
}

const defaultRegistry = createOpenChapterRegistry();

/** Tells other tabs which chapter this tab is reading; `undefined` clears it. */
export function announceOpenChapter(chapter: CacheChapterRef | undefined): void {
  defaultRegistry.setOpenChapter(chapter);
}

export function listOpenChapters(): Promise<readonly CacheChapterRef[]> {
  return defaultRegistry.listOpenChapters();
}
