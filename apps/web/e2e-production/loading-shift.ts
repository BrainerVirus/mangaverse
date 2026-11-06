import type { Page, Route } from '@playwright/test';

/**
 * Layout-shift harness for the loading states.
 *
 * The local database opens by fetching the sql.js WASM binary, so holding that one
 * request keeps every route in `dbStatus === 'loading'` for as long as the test wants
 * and releasing it resolves the data -- no production code carries a delay seam, the
 * request is simply paused from the browser side.
 */

interface ShiftEntry {
  readonly value: number;
  readonly at: number;
  readonly sources: readonly {
    readonly node: string;
    readonly from: string;
    readonly to: string;
  }[];
}

const OBSERVER = `
(() => {
  const w = window;
  w.__shifts = [];
  const label = (node) => {
    if (!node || node.nodeType !== 1) return node ? node.nodeName : '?';
    const parts = [];
    let el = node;
    for (let depth = 0; el && el.nodeType === 1 && depth < 3; depth += 1) {
      const aria = el.getAttribute('aria-label');
      const testId = el.getAttribute('data-testid');
      let part = el.tagName.toLowerCase();
      if (el.id) part += '#' + el.id;
      if (testId) part += '[data-testid=' + testId + ']';
      if (aria) part += '[aria-label=' + aria + ']';
      const cls = typeof el.className === 'string' ? el.className.split(/\\s+/).filter(Boolean).slice(0, 2).join('.') : '';
      if (cls) part += '.' + cls;
      parts.unshift(part);
      el = el.parentElement;
    }
    return parts.join(' > ');
  };
  const rect = (r) => Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height);
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        w.__shifts.push({
          value: entry.value,
          at: Math.round(entry.startTime),
          sources: (entry.sources || []).map((s) => ({
            node: label(s.node),
            from: rect(s.previousRect),
            to: rect(s.currentRect),
          })),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
})();
`;

const WASM_PATTERN = '**/assets/sql-wasm-*.wasm';

interface DataGate {
  /** Lets the held database request through. */
  release: () => void;
  /** Removes the hold, releasing anything still waiting. */
  dispose: () => Promise<void>;
}

/** Holds the sql.js WASM request, which keeps the local database in `loading`. */
export async function holdLocalDatabase(page: Page): Promise<DataGate> {
  let release: () => void = () => {};
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(WASM_PATTERN, async (route: Route) => {
    await open;
    await route.continue();
  });
  return {
    release,
    dispose: async () => {
      release();
      await page.unroute(WASM_PATTERN);
    },
  };
}

export async function observeLayoutShift(page: Page): Promise<void> {
  await page.addInitScript(OBSERVER);
}

export async function readShifts(page: Page): Promise<ShiftEntry[]> {
  return page.evaluate(
    () => (window as unknown as { __shifts: ShiftEntry[] }).__shifts as ShiftEntry[],
  );
}

export const sumShifts = (entries: readonly ShiftEntry[]): number =>
  Math.round(entries.reduce((total, entry) => total + entry.value, 0) * 10_000) / 10_000;
