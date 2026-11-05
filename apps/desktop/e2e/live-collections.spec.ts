import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

// #210 part 2 on the production build: the library list reads through TanStack DB collections
// the data host keeps current, so two windows see each other's edits live, a refused edit rolls
// back, and a host that dies is restarted with every window reconnected and no committed data lost.

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
const dbPackageRoot = join(desktopRoot, '../../packages/db');
const electronPath = createRequire(import.meta.url)('electron') as unknown as string;
const DATABASE = 'mangaverse.sqlite';
const TITLES = ['Live Alpha', 'Live Beta', 'Live Gamma'] as const;
const HOST_SERVICE = 'MangaVerse data host';
const RESTARTED = 'The local library stopped and was restarted.';
const OUTCOME_UNKNOWN =
  'The local library restarted, so this change may or may not have been saved. Check before doing it again.';

const cleanups: (() => void)[] = [];

test.afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A profile whose native database already holds three titles and a finished onboarding. */
async function seededProfile(): Promise<string> {
  const directory = mkdtempSync(join(tmpdir(), 'mangaverse-live-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const host = await import(pathToFileURL(join(dbPackageRoot, 'dist/host/index.js')).href);
  const db = await import(pathToFileURL(join(dbPackageRoot, 'dist/index.js')).href);
  const native = host.openNativeDatabase(join(directory, DATABASE));
  for (const title of TITLES) {
    const identity = await db.createMangaIdentityWithInitialMapping(native.db, {
      canonicalTitle: title,
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'mangadex',
      providerMangaId: title,
    });
    await db.addLibraryEntry(native.db, { mangaId: identity.value.mangaId, status: 'reading' });
  }
  const now = new Date().toISOString();
  await db.upsertAppSetting(native.db, 'onboarding', {
    status: 'completed',
    currentStep: 'provider',
    completedSteps: ['welcome', 'theme', 'reading', 'preferences', 'provider'],
    startedAt: now,
    completedAt: now,
  });
  native.close();
  return directory;
}

async function launch(userDataDir: string): Promise<{ app: ElectronApplication; first: Page }> {
  if (!existsSync(join(desktopRoot, 'dist/renderer/index.html'))) {
    throw new Error('Build the desktop app first: pnpm --filter @app/desktop build');
  }
  const env = { ...process.env } as Record<string, string>;
  delete env.VITE_DEV_SERVER_URL;
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [desktopRoot, `--user-data-dir=${userDataDir}`],
    env,
  });
  cleanups.unshift(() => void app.close().catch(() => undefined));
  await app.evaluate(({ session }) => {
    session.defaultSession.enableNetworkEmulation({ offline: true });
  });
  const first = await app.firstWindow();
  await first.goto('app://app/library');
  await expect(first.getByText(TITLES[0]).first()).toBeVisible({ timeout: 20_000 });
  return { app, first };
}

/**
 * Has main build another window with its own `createWindow`, through the hook an unpackaged
 * build exposes: only windows main builds are owned, so a window built here would get no port.
 */
async function openOwnedWindow(app: ElectronApplication, url: string): Promise<Page> {
  const opened = app.waitForEvent('window');
  const hooked = await app.evaluate((_electron, target) => {
    const open: unknown = Reflect.get(globalThis, '__mangaverseE2EOpenWindow');
    if (typeof open !== 'function') return false;
    open(target);
    return true;
  }, url);
  if (!hooked) {
    void opened.catch(() => undefined);
    throw new Error(
      'The app exposes no __mangaverseE2EOpenWindow hook (a packaged build): the E2E cannot open an owned window.',
    );
  }
  return opened;
}

/** A second window built by main, the way the app builds its own. */
async function secondWindow(app: ElectronApplication): Promise<Page> {
  const page = await openOwnedWindow(app, 'app://app/library');
  await expect(page.getByText(TITLES[0]).first()).toBeVisible({ timeout: 20_000 });
  return page;
}

const statusOf = (page: Page, title: string) =>
  page
    .locator('[data-library-card]')
    .filter({ hasText: title })
    .locator('[data-library-card-meta] span')
    .first();

/** Records every status text a card shows, so a flicker back to the old value is caught. */
async function watchStatus(page: Page, title: string): Promise<() => Promise<string[]>> {
  const key = `__statusTrail_${title.replace(/\W/g, '')}`;
  await page.evaluate(
    ({ title: watched, key: slot }) => {
      const trail: string[] = [];
      (window as unknown as Record<string, string[]>)[slot] = trail;
      const read = () => {
        const card = [...document.querySelectorAll('[data-library-card]')].find((node) =>
          node.textContent?.includes(watched),
        );
        const text = card?.querySelector('[data-library-card-meta] span')?.textContent ?? '';
        if (trail.at(-1) !== text) trail.push(text);
      };
      read();
      new MutationObserver(read).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    },
    { title, key },
  );
  return () =>
    page.evaluate((slot) => (window as unknown as Record<string, string[]>)[slot] ?? [], key);
}

async function setStatus(page: Page, title: string, status: string): Promise<void> {
  const select = page.getByRole('button', { name: 'Select titles' });
  if (await select.isVisible()) await select.click();
  for (const other of TITLES) {
    const box = page.getByRole('checkbox', { name: `Select ${other}` });
    if ((await box.isChecked()) !== (other === title)) await box.click();
  }
  await page.getByRole('combobox', { name: 'Set status for selected' }).click();
  await page.getByRole('option', { name: status, exact: true }).click();
}

function storedStatus(userDataDir: string, title: string): string | undefined {
  const database = new DatabaseSync(join(userDataDir, DATABASE), { readOnly: true });
  const row = database
    .prepare(
      `SELECT e.status AS status FROM library_entries e
       JOIN manga_identities m ON m.id = e.manga_id WHERE m.canonical_title = ?`,
    )
    .get(title) as { status: string } | undefined;
  database.close();
  return row?.status;
}

/** Waits until a host other than `previous` is running, and returns its pid. */
async function replacedHost(app: ElectronApplication, previous: number | undefined) {
  let pid: number | undefined;
  await expect
    .poll(
      async () => {
        pid = await hostPid(app);
        return pid !== undefined && pid !== previous;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return pid!;
}

async function hostPid(app: ElectronApplication): Promise<number | undefined> {
  return app.evaluate(
    ({ app: electronApp }, service) =>
      electronApp
        .getAppMetrics()
        .find((metric) => metric.serviceName === service || metric.name === service)?.pid,
    HOST_SERVICE,
  );
}

test('two windows edit the library live, and a refused edit rolls back in place', async () => {
  const userDataDir = await seededProfile();
  const { app, first } = await launch(userDataDir);
  const second = await secondWindow(app);
  await expect(statusOf(second, TITLES[0])).toHaveText('Reading');

  // An accepted edit: at once in this window, live in the other, never flickering back.
  const trail = await watchStatus(first, TITLES[0]);
  const clickedAt = Date.now();
  await setStatus(first, TITLES[0], 'Completed');
  await expect(statusOf(first, TITLES[0])).toHaveText('Completed');
  const shownMs = Date.now() - clickedAt;
  await expect(statusOf(second, TITLES[0])).toHaveText('Completed', { timeout: 10_000 });
  const otherWindowMs = Date.now() - clickedAt;
  await expect.poll(() => storedStatus(userDataDir, TITLES[0])).toBe('completed');
  expect(await trail()).toEqual(['Reading', 'Completed']);

  // The other direction, from the second window.
  await setStatus(second, TITLES[2], 'On hold');
  await expect(statusOf(first, TITLES[2])).toHaveText('On hold', { timeout: 10_000 });

  // A refused edit: SQLite aborts it, the optimistic row rolls back and the failure is reported.
  const side = new DatabaseSync(join(userDataDir, DATABASE));
  side.exec(
    `CREATE TRIGGER e2e_lock_status BEFORE UPDATE OF status ON library_entries
     WHEN OLD.manga_id = (SELECT id FROM manga_identities WHERE canonical_title = '${TITLES[1]}')
     BEGIN SELECT RAISE(ABORT, 'entry is locked by the test'); END`,
  );
  side.close();
  const refused = await watchStatus(first, TITLES[1]);
  await setStatus(first, TITLES[1], 'Dropped');
  // One toast with our own copy (#296): the SQLite text stays in the log, never on screen.
  const failureToasts = first.locator('[data-sonner-toast][data-type="error"]');
  await expect(failureToasts).toHaveCount(1, { timeout: 10_000 });
  await expect(failureToasts).toHaveText('Could not update your library.');
  await expect(first.getByText('entry is locked by the test')).toHaveCount(0);
  await expect(statusOf(first, TITLES[1])).toHaveText('Reading');
  expect(await refused()).toEqual(['Reading', 'Dropped', 'Reading']);
  await expect(statusOf(second, TITLES[1])).toHaveText('Reading');
  expect(storedStatus(userDataDir, TITLES[1])).toBe('reading');

  test.info().annotations.push({
    type: 'live',
    description: `optimistic shown ${shownMs} ms after the click, other window ${otherWindowMs} ms`,
  });
});

/**
 * Streams numbered writes into the host over a raw port, from a third owned window showing a
 * static app:// file: no app shell runs there, so the port is the test's alone.
 */
async function startWriteStream(app: ElectronApplication, count: number): Promise<Page> {
  const writer = await openOwnedWindow(app, 'app://app/favicon.svg');
  await writer.waitForLoadState('domcontentloaded');
  await writer.evaluate(async (total) => {
    const port = await new Promise<MessagePort>((resolve) => {
      const take = (event: MessageEvent) => {
        if (event.data !== 'mangaverse:data-host-port' || event.ports[0] === undefined) return;
        window.removeEventListener('message', take);
        resolve(event.ports[0]);
      };
      window.addEventListener('message', take);
      void (
        window as unknown as { mangaverseDataHost: { connect(): Promise<unknown> } }
      ).mangaverseDataHost.connect();
    });
    const acked: number[] = [];
    (window as unknown as { __acked: number[] }).__acked = acked;
    port.onmessage = (event) => {
      const reply = event.data as { id?: number; result?: { ok: boolean } };
      if (typeof reply.id === 'number' && reply.result?.ok === true) acked.push(reply.id);
    };
    for (let id = 1; id <= total; id += 1) {
      port.postMessage({
        kind: 'call',
        id,
        method: 'upsertAppSetting',
        args: [`e2e-crash-${id}`, id],
      });
    }
  }, count);
  return writer;
}

const STREAM_WRITES = 100_000;

const ackedWrites = (page: Page) =>
  page.evaluate(() => [...((window as unknown as { __acked?: number[] }).__acked ?? [])]);

test('a killed host settles a pending write as outcome-unknown, restarts, reconnects every window and keeps committed data', async () => {
  test.setTimeout(180_000);
  const userDataDir = await seededProfile();
  const { app, first } = await launch(userDataDir);
  const second = await secondWindow(app);

  // Committed before anything goes wrong.
  await setStatus(first, TITLES[0], 'Completed');
  await expect(statusOf(second, TITLES[0])).toHaveText('Completed', { timeout: 10_000 });

  // 1. The host hangs with a write in flight, then is killed: the write times out with a
  //    typed `data-host.crashed` error (#318) and rolls back, while main restarts the host and
  //    both windows are told. The pending write settles when the port is replaced, so the user is
  //    told the outcome is unknown, not that the database timed out.
  const hungPid = await hostPid(app);
  expect(hungPid).toBeDefined();
  process.kill(hungPid!, 'SIGSTOP');
  await setStatus(first, TITLES[1], 'Dropped');
  await expect(statusOf(first, TITLES[1])).toHaveText('Dropped');
  const killedAt = Date.now();
  process.kill(hungPid!, 'SIGKILL');
  const restartedPid = await replacedHost(app, hungPid);
  const restartedMs = Date.now() - killedAt;
  for (const page of [first, second]) {
    await expect(page.getByText(RESTARTED, { exact: false })).toBeVisible({ timeout: 20_000 });
  }
  const toldMs = Date.now() - killedAt;
  // Two error toasts, each once: the restart notice, and the pending write's own outcome.
  const failureToasts = first.locator('[data-sonner-toast][data-type="error"]');
  await expect(failureToasts).toHaveCount(2, { timeout: 45_000 });
  await expect(failureToasts.filter({ hasText: RESTARTED })).toHaveCount(1);
  await expect(failureToasts.filter({ hasText: OUTCOME_UNKNOWN })).toHaveCount(1);
  await expect(first.getByText('The local database did not answer in time.')).toHaveCount(0);
  const settledMs = Date.now() - killedAt;
  await expect(statusOf(first, TITLES[1])).toHaveText('Reading');
  expect(storedStatus(userDataDir, TITLES[1])).toBe('reading');

  // Both windows are on the new host: an edit in one reaches the other live.
  await setStatus(second, TITLES[2], 'Planned');
  await expect(statusOf(first, TITLES[2])).toHaveText('Planned', { timeout: 10_000 });
  await expect(statusOf(first, TITLES[0])).toHaveText('Completed');

  // 2. kill -9 in the middle of a stream of writes.
  const writer = await startWriteStream(app, STREAM_WRITES);
  await expect
    .poll(() => ackedWrites(writer).then((acked) => acked.length), { intervals: [50] })
    .toBeGreaterThan(2_000);
  const streamPid = await hostPid(app);
  process.kill(streamPid!, 'SIGKILL');
  const killedMidWriteAt = Date.now();
  const acked = await ackedWrites(writer);
  await replacedHost(app, streamPid);
  expect(acked.length).toBeLessThan(STREAM_WRITES);
  const reopenedMs = Date.now() - killedMidWriteAt;
  // The reopened host serves the windows again.
  await setStatus(first, TITLES[2], 'Reading');
  await expect(statusOf(second, TITLES[2])).toHaveText('Reading', { timeout: 10_000 });
  await app.close();

  const database = new DatabaseSync(join(userDataDir, DATABASE));
  const [integrity] = database.prepare('PRAGMA integrity_check').all() as {
    integrity_check: string;
  }[];
  const stored = new Set(
    (
      database.prepare(`SELECT key FROM app_settings WHERE key LIKE 'e2e-crash-%'`).all() as {
        key: string;
      }[]
    ).map((row) => row.key),
  );
  database.close();
  expect(integrity?.integrity_check).toBe('ok');
  const lost = acked.filter((id) => !stored.has(`e2e-crash-${id}`));
  expect(lost).toEqual([]);
  expect(storedStatus(userDataDir, TITLES[0])).toBe('completed');

  test.info().annotations.push({
    type: 'crash',
    description:
      `SIGSTOP+SIGKILL pid ${hungPid}: restarted as ${restartedPid} after ${restartedMs} ms, ` +
      `windows told by ${toldMs} ms, pending write settled as outcome-unknown at ${settledMs} ms. ` +
      `kill -9 pid ${streamPid} mid-stream: ${acked.length} acks (${new Set(acked).size} distinct, ` +
      `duplicates ${JSON.stringify(acked.filter((id, index) => acked.indexOf(id) !== index))}), ${stored.size} stored, ` +
      `0 lost, reopened in ${reopenedMs} ms, integrity_check ${integrity?.integrity_check}`,
  });
});
