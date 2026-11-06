import type { PlatformAdapter } from '@app/platform';
import type { AppDrizzleDb } from '@app/db';
import type { ChapterId, MangaId, ProviderId } from '@app/shared';

import { acquirePageObjectUrl, releasePageObjectUrl } from './page-object-url-registry.js';

/** One page the reader wants warm, in the order it wants them. */
export interface PageDecodePlanItem {
  readonly pageIndex: number;
  readonly remoteUrl: string;
}

export interface PageDecodePoolInput {
  readonly db: AppDrizzleDb;
  readonly adapter: PlatformAdapter;
  readonly providerId: ProviderId | string;
  readonly mangaId: MangaId | string;
  readonly chapterId: ChapterId | string;
  /**
   * The display downscale cap the reader's page images use. It must match theirs:
   * the pool warms the URL they will mount, and a different cap is a different URL.
   */
  readonly maxDisplayEdge?: number | undefined;
  /** Pages decoded at once. Two keeps a turn warm without decoding a burst. */
  readonly concurrency?: number;
  /** Decoded pages kept alive. Everything beyond it is released on re-plan. */
  readonly maxEntries?: number;
  /** Test seam; production uses a detached `HTMLImageElement`. */
  readonly decode?: (url: string) => Promise<DecodedPage | undefined>;
  readonly onDecoded?: (metric: { pageIndex: number; durationMs: number }) => void;
}

/** A decoded bitmap kept alive by holding the element that owns it. */
export interface DecodedPage {
  readonly release: () => void;
}

export interface PageDecodePoolSnapshot {
  readonly decoded: number;
  readonly pending: number;
  readonly released: number;
  readonly failures: number;
}

export interface PageDecodePool {
  /** Replaces the plan. Pages that left it are released; new ones queue. */
  readonly setPlan: (items: readonly PageDecodePlanItem[]) => void;
  readonly snapshot: () => PageDecodePoolSnapshot;
  readonly dispose: () => void;
}

interface Slot {
  readonly pageIndex: number;
  readonly remoteUrl: string;
  status: 'queued' | 'decoding' | 'decoded';
  /** Bumped when a slot is dropped, so a late decode cannot resurrect it. */
  generation: number;
  image?: DecodedPage | undefined;
  /**
   * True only while the slot owns a URL reference of its own: set when its
   * acquire succeeds, cleared when the reference is given back. A queued slot
   * owns none, so dropping it must not release a reference another holder owns.
   */
  holdsUrl: boolean;
}

/**
 * Bounded decode-ahead: keeps a small set of pages decoded around the reader's
 * plan so a page turn paints from the browser's image cache instead of waiting
 * on a decode. Pages that leave the plan release their bitmap and their URL
 * reference immediately, so memory is bounded by `maxEntries`, not by chapter
 * length. Only already-cached pages are warmed: downloads stay the prefetch
 * sweep's job, with its budget.
 */
export function createPageDecodePool(input: PageDecodePoolInput): PageDecodePool {
  const concurrency = Math.max(1, input.concurrency ?? 2);
  const maxEntries = Math.max(1, input.maxEntries ?? 6);
  const decode = input.decode ?? decodeDetachedImage;

  const slots = new Map<number, Slot>();
  const queue: Slot[] = [];
  let generation = 0;
  let active = 0;
  let disposed = false;
  let released = 0;
  let failures = 0;

  const pageInput = (slot: Slot) => ({
    db: input.db,
    adapter: input.adapter,
    providerId: input.providerId,
    mangaId: input.mangaId,
    chapterId: input.chapterId,
    pageIndex: slot.pageIndex,
    remoteUrl: slot.remoteUrl,
    retention: 'read' as const,
    maxDisplayEdge: input.maxDisplayEdge,
  });

  const giveBackUrl = (slot: Slot): void => {
    if (!slot.holdsUrl) return;
    slot.holdsUrl = false;
    void releasePageObjectUrl(pageInput(slot));
  };

  const releaseSlot = (slot: Slot): void => {
    slot.generation += 1;
    if (slot.image !== undefined) {
      slot.image.release();
      slot.image = undefined;
      released += 1;
    }
    if (slots.get(slot.pageIndex) === slot) slots.delete(slot.pageIndex);
    giveBackUrl(slot);
  };

  const pump = (): void => {
    while (!disposed && active < concurrency && queue.length > 0) {
      const slot = queue.shift();
      if (slot === undefined) return;
      if (slots.get(slot.pageIndex) !== slot || slot.status !== 'queued') continue;
      slot.status = 'decoding';
      active += 1;
      const slotGeneration = slot.generation;
      const startedAt = performance.now();
      const finish = (): void => {
        active -= 1;
        pump();
      };
      const fail = (): void => {
        failures += 1;
        if (slot.generation === slotGeneration) slot.status = 'queued';
        if (slot.image !== undefined) {
          slot.image.release();
          slot.image = undefined;
        }
        giveBackUrl(slot);
        finish();
      };
      void (async () => {
        const acquired = await acquirePageObjectUrl(pageInput(slot), { cachedOnly: true });
        if (acquired === undefined) {
          // The page is not cached yet (the prefetch sweep owns downloads).
          // Leave it queued so the next plan re-tries it; do not spin here.
          if (slot.generation === slotGeneration) slot.status = 'queued';
          return;
        }
        slot.holdsUrl = true;
        const decoded = await decode(acquired.objectUrl);
        if (disposed || slot.generation !== slotGeneration) {
          // The plan moved on (or the pool closed) while this decode was in
          // flight; drop the bitmap it produced instead of caching it.
          decoded?.release();
          giveBackUrl(slot);
          return;
        }
        if (decoded === undefined) {
          failures += 1;
          giveBackUrl(slot);
          return;
        }
        slot.status = 'decoded';
        slot.image = decoded;
        input.onDecoded?.({
          pageIndex: slot.pageIndex,
          durationMs: performance.now() - startedAt,
        });
      })().then(finish, fail);
    }
  };

  return {
    setPlan: (items) => {
      if (disposed) return;
      generation += 1;
      const wanted = new Map<number, PageDecodePlanItem>();
      for (const item of items) {
        if (wanted.size >= maxEntries) break;
        if (!wanted.has(item.pageIndex)) wanted.set(item.pageIndex, item);
      }

      for (const slot of [...slots.values()]) {
        if (!wanted.has(slot.pageIndex)) releaseSlot(slot);
      }

      queue.length = 0;
      for (const item of [...wanted.values()].sort((a, b) => a.pageIndex - b.pageIndex)) {
        const existing = slots.get(item.pageIndex);
        if (existing !== undefined && existing.remoteUrl === item.remoteUrl) {
          if (existing.status === 'queued') queue.push(existing);
          continue;
        }
        if (existing !== undefined) releaseSlot(existing);
        const slot: Slot = {
          pageIndex: item.pageIndex,
          remoteUrl: item.remoteUrl,
          status: 'queued',
          generation,
          holdsUrl: false,
        };
        slots.set(item.pageIndex, slot);
        queue.push(slot);
      }
      // Keep the plan's priority: decode in the order the reader asked for,
      // not page order.
      const order = new Map([...wanted.values()].map((item, index) => [item.pageIndex, index]));
      queue.sort((a, b) => (order.get(a.pageIndex) ?? 0) - (order.get(b.pageIndex) ?? 0));
      pump();
    },
    snapshot: () => ({
      decoded: [...slots.values()].filter((slot) => slot.status === 'decoded').length,
      pending: active + queue.length,
      released,
      failures,
    }),
    dispose: () => {
      disposed = true;
      queue.length = 0;
      for (const slot of [...slots.values()]) releaseSlot(slot);
    },
  };
}

/**
 * Browser default: a detached image element is the owner of one decoded
 * bitmap. Keeping it referenced is what lets the later `<img>` with the same
 * URL paint from cache; dropping the reference (and the URL) frees it.
 */
function decodeDetachedImage(url: string): Promise<DecodedPage | undefined> {
  if (typeof Image === 'undefined') return Promise.resolve(undefined);
  const image = new Image();
  image.decoding = 'async';
  image.src = url;

  const decoded =
    typeof image.decode === 'function'
      ? image.decode()
      : new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('page image failed'));
        });

  return decoded.then(
    () => ({
      release: () => {
        image.src = '';
      },
    }),
    () => undefined,
  );
}
