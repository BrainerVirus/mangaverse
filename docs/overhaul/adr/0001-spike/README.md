# ADR 0001 spike

Runnable evidence for [ADR 0001](../0001-data-host.md). Dependencies install in a throwaway directory; nothing
under the repo's `package.json`, lockfile or workspace changes.

## Run it

Needs macOS, `pnpm install` done in the repo (for its Electron binary), and network for npm and Electron headers.

```sh
SPIKE_DIR=/tmp/adr-0001-spike bash docs/overhaul/adr/0001-spike/run-all.sh
```

That takes about 3 minutes, deletes and recreates `SPIKE_DIR`, and rewrites `evidence/`. Electron opens hidden windows.
Override the binary with `ELECTRON=/abs/path/to/electron`.

To run one probe after `setup.sh` (commands assume `cd "$SPIKE_DIR"`, with `SPIKE_DIR` and `ELECTRON` exported):

```sh
node probes/build.mjs p1-drivers.mjs
DRIVER=node:sqlite ELECTRON_RUN_AS_NODE=1 "$ELECTRON" out/p1-drivers.mjs
DRIVER=better-sqlite3 ELECTRON_RUN_AS_NODE=1 "$ELECTRON" out/p1-drivers.mjs

DRIVER=node:sqlite ELECTRON_RUN_AS_NODE=1 "$ELECTRON" node_modules/vitest/vitest.mjs run \
  --config probes/p2-suite.vitest.config.mjs --reporter=dot

bash probes/run-p5.sh node:sqlite better-sqlite3
bash probes/run-p6.sh
```

The suite takes switches: `DRIVER=sql.js` is the baseline, `RPC_CLONE=1` clones every repository call, and
`RPC_CLONE_BREAK=1` is its control. `CONVERTED=1` makes `@app/db` the generated client; generate it first with
`node probes/p3-generate-client.mjs work/packages/db-src index work/packages/db-src/client.gen.ts`.

Probe sources end in `.txt` in the repo, and `setup.sh` strips it. Otherwise the workspace's `knip` reports them as
unused files and `oxfmt` claims them, and the spike must not edit that configuration.

## What each file shows

| Evidence (`evidence/`)    | Probe                       | Shows                                                                    |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| `00-setup`, `01-runtime`  | `setup.sh`                  | Install, machine and runtime facts                                       |
| `02-native-facts`         | `p1d-native-facts.sh`       | `better-sqlite3` prebuilds, `@electron/rebuild`, the source build        |
| `03-stock-driver-as-is`   | `p0-stock-driver`           | Drizzle's stock driver does not accept `node:sqlite` as-is               |
| `04-drivers-*`            | `p1-drivers`                | Real migrations, read, write, rollbacks and the budget dataset           |
| `05-facts-*`              | `p1b-facts`                 | Compile options, cold open, `kill -9`, change capture, sql.js import     |
| `06-no-native-dependency` | `p1c-no-native.sh`          | `node:sqlite` compiles and runs with `better-sqlite3` removed            |
| `07-suite-*`              | `p2-suite.vitest.config`    | Real `@app/db` and `@app/extensions` tests, unchanged, on each driver    |
| `08-*`                    | `p2-suite`, `RPC_CLONE=1`   | Repository calls survive `structuredClone`, and the control proves reach |
| `09-type-candidates`      | `types/run-candidates.sh`   | The `AppDrizzleDb` options against `@app/db` and extensions core         |
| `10-workspace-typecheck`  | `p3-workspace-typecheck.sh` | Whole workspace: baseline, alias only, then the generated client         |
| `11-converted-callers-*`  | `p2-suite`, `CONVERTED=1`   | Features through the client over a real `MessageChannel`                 |
| `12-electron-end-to-end`  | `p5-*`, `lib/scenario`      | Utility process, two sandboxed windows, TanStack DB, both drivers        |
| `13-web-worker-fit`       | `p6-*`, `lib/scenario`      | The same scenario in a Web Worker                                        |

The code a reader will want first:

- `probes/lib/node-sqlite-client.mjs.txt`: the adapter.
- `probes/lib/open-db.mjs.txt` and `probes/types/host-opener.ts.txt`: building Drizzle over either driver.
- `probes/lib/rpc.mjs.txt` and `probes/p3-generate-client.mjs.txt`: the host contract and the client.
- `probes/lib/host-collections.mjs.txt`: the TanStack DB adapter.

## Reading the results

- `07-suite-node-sqlite` and `07-suite-better-sqlite3` show 1 failure, and that is expected:
  `applies migrations idempotently on sql.js` hands the native handle to the sql.js migrator. `persistent-database`,
  `bundled-migrations` and `browser` tests are excluded because they test the renderer's sql.js session, as is
  `extensions/index.test.ts`, which imports React components this directory has no design system for.
- The native harness (`lib/native-harness`) replaces only the harness module and shims `raw.exec`, `raw.run` and
  `raw.prepare`. Test files are not edited.
- `10-workspace-typecheck` needs a local clone, and installs with `--ignore-scripts`.
- Install time depends on the npm cache: the first install took 29 s, while `00-setup` shows a cached rerun.
- `@electron/rebuild` reports success but builds nothing: `02-native-facts` shows 0 `.node` files, because the package
  sets `gypfile: false`. Forcing a source build takes `--force_build=1`, and took about 13 s.
- Vitest's persistent module cache ignores the env switches and silently kept the previous mode's wiring. The config
  turns it off, and the `08` control is what caught it.
- Timings come from one fast Mac and only compare drivers here. They say nothing about the reference machine.
