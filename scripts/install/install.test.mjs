// Runs the real install.sh against a throwaway HOME and a fake curl, so nothing touches the
// network or the user's installed app. The staged path is what lets the desktop app download an
// update itself (with progress) and still have the installer decide, by checksum, whether it installs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./install.sh", import.meta.url));
const VERSION = "0.0.9-nightly.20261201.1";
const DARWIN = process.platform === "darwin";
const SUPPORTED =
  (DARWIN && process.arch === "arm64") || (process.platform === "linux" && process.arch === "x64");
const ASSET = `MangaVerse-${VERSION}-${DARWIN ? "arm64.zip" : "x86_64.AppImage"}`;
const skip = !SUPPORTED
  ? "install.sh supports macOS arm64 and Linux x64"
  : process.getuid?.() === 0
    ? "install.sh refuses to run as root"
    : false;

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

describe("install.sh --staged", { skip }, () => {
  let root;
  let home;
  let fixtures;
  let shim;
  let curlLog;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "mv-install-test-"));
    fixtures = join(root, "fixtures");
    shim = join(root, "shim");
    curlLog = join(root, "curl.log");
    mkdirSync(fixtures);
    mkdirSync(shim);
    // The release asset: a zip holding the app on macOS, a plain executable file on Linux.
    if (DARWIN) {
      const app = join(root, "build/MangaVerse.app/Contents/MacOS");
      mkdirSync(app, { recursive: true });
      writeFileSync(join(app, "MangaVerse"), "#!/bin/sh\nexit 0\n");
      chmodSync(join(app, "MangaVerse"), 0o755);
      const zip = spawnSync("zip", ["-qr", join(fixtures, ASSET), "MangaVerse.app"], {
        cwd: join(root, "build"),
      });
      assert.equal(zip.status, 0, String(zip.stderr));
    } else {
      writeFileSync(join(fixtures, ASSET), "#!/bin/sh\nexit 0\n");
    }
    writeFileSync(join(fixtures, "SHA256SUMS"), `${sha256(join(fixtures, ASSET))}  ${ASSET}\n`);
    // A fake curl: serves fixtures by file name and records every URL it is asked for.
    writeFileSync(
      join(shim, "curl"),
      `#!/bin/sh
out=""; url=""
while [ "$#" -gt 0 ]; do
  case "$1" in -o) out="$2"; shift ;; http*) url="$1" ;; esac
  shift
done
echo "$url" >> "${curlLog}"
[ -f "${fixtures}/$(basename "$url")" ] || exit 22
cp "${fixtures}/$(basename "$url")" "$out"
`,
    );
    chmodSync(join(shim, "curl"), 0o755);
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  function stage(name, mutate) {
    const dir = join(root, name);
    mkdirSync(dir);
    writeFileSync(join(dir, ASSET), readFileSync(join(fixtures, ASSET)));
    writeFileSync(join(dir, "SHA256SUMS"), readFileSync(join(fixtures, "SHA256SUMS")));
    chmodSync(dir, 0o700);
    mutate?.(dir);
    return dir;
  }

  function run(args, { env = {}, cwd } = {}) {
    home = mkdtempSync(join(root, "home-"));
    writeFileSync(curlLog, "");
    const result = spawnSync("sh", [SCRIPT, ...args, "--no-launch"], {
      encoding: "utf8",
      ...(cwd === undefined ? {} : { cwd }),
      env: {
        PATH: `${shim}:${process.env.PATH}`,
        HOME: home,
        TMPDIR: root,
        ...env,
        ...(process.platform === "linux" ? { XDG_DATA_HOME: join(home, ".local/share") } : {}),
      },
    });
    const status = spawnSync("sh", [SCRIPT, "status"], {
      encoding: "utf8",
      env: { HOME: home, PATH: process.env.PATH },
    });
    const appPath = /^app_path=(.*)$/m.exec(status.stdout)?.[1];
    const binary =
      appPath === undefined
        ? undefined
        : DARWIN
          ? join(appPath, "Contents/MacOS/MangaVerse")
          : appPath;
    return {
      installedContent:
        binary !== undefined && existsSync(binary) ? readFileSync(binary, "utf8") : undefined,
      code: result.status,
      stderr: result.stderr,
      installed: /version=/.test(status.stdout) && status.stdout.includes(`version=${VERSION}`),
      curlCalls: readFileSync(curlLog, "utf8").split("\n").filter(Boolean),
    };
  }

  it("Given a staged download that matches its checksum, When installing, Then it installs without any download and the staged directory is removed", () => {
    const dir = stage("mangaverse-staged-ok");
    const result = run(["update", "--version", VERSION, "--staged", dir]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.installed, true);
    assert.deepEqual(
      result.curlCalls.filter((url) => url.includes("/releases/download/")),
      [],
    );
    assert.equal(existsSync(dir), false);
  });

  it("Given a staged asset that does not match SHA256SUMS, When installing, Then the install is refused and nothing is installed", () => {
    const dir = stage("mangaverse-staged-bad", (d) => writeFileSync(join(d, ASSET), "tampered"));
    const result = run(["update", "--version", VERSION, "--staged", dir]);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /checksum mismatch/);
    assert.equal(result.installed, false);
  });

  it("Given a staged directory without SHA256SUMS, When installing, Then the install is refused", () => {
    const dir = stage("mangaverse-staged-nosums", (d) => rmSync(join(d, "SHA256SUMS")));
    const result = run(["update", "--version", VERSION, "--staged", dir]);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /SHA256SUMS is missing/);
    assert.equal(result.installed, false);
  });

  it("Given a staged directory the app did not name, When installing, Then it is refused and left alone", () => {
    const dir = stage("somebody-elses-dir");
    const result = run(["update", "--version", VERSION, "--staged", dir]);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /one the app created/);
    assert.equal(result.installed, false);
    assert.equal(existsSync(join(dir, ASSET)), true);
  });

  it("Given a path that only looks like a staged directory through .., When installing, Then the real target is refused and never deleted", () => {
    const decoy = stage("mangaverse-staged-decoy");
    const victim = join(root, "victim");
    mkdirSync(victim);
    writeFileSync(join(victim, "keep.txt"), "mine");
    const result = run(["update", "--version", VERSION, "--staged", `${decoy}/../victim`]);
    assert.notEqual(result.code, 0);
    assert.equal(existsSync(join(victim, "keep.txt")), true);
    assert.equal(existsSync(decoy), true);
  });

  it("Given a relative path to a staged directory, When installing, Then it installs and that directory is removed", () => {
    const dir = stage("mangaverse-staged-relative");
    const result = run(["update", "--version", VERSION, "--staged", "mangaverse-staged-relative"], {
      cwd: root,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(existsSync(dir), false);
  });

  it("Given an empty --staged value, When installing, Then it is refused instead of falling back to a download", () => {
    const result = run(["update", "--version", VERSION, "--staged", ""]);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /needs a directory/);
    assert.deepEqual(result.curlCalls, []);
  });

  it("Given a staged asset that is a symlink, When installing, Then it is refused", () => {
    const dir = stage("mangaverse-staged-link", (d) => {
      rmSync(join(d, ASSET));
      symlinkSync(join(fixtures, ASSET), join(d, ASSET));
    });
    const result = run(["update", "--version", VERSION, "--staged", dir]);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /symlink/);
    assert.equal(result.installed, false);
  });

  it("Given a staged directory other users can write to, When installing, Then it is refused", () => {
    const dir = stage("mangaverse-staged-open", (d) => chmodSync(d, 0o777));
    const result = run(["update", "--version", VERSION, "--staged", dir]);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /writable by others/);
    assert.equal(result.installed, false);
  });

  it("Given the staged asset is swapped right after it is hashed, When installing, Then the bytes that were checked are the ones installed", () => {
    const dir = stage("mangaverse-staged-race");
    // A hashing shim that runs the real tool, then replaces the staged asset: what an attacker would
    // do. Whichever of sha256sum and shasum the script picks on this machine is shimmed.
    const shimmed = ["sha256sum", "shasum"].flatMap((tool) => {
      const real = spawnSync("sh", ["-c", `command -v ${tool}`], {
        encoding: "utf8",
      }).stdout.trim();
      if (real === "") return [];
      writeFileSync(
        join(shim, tool),
        `#!/bin/sh\n"${real}" "$@"\nrc=$?\n[ -z "\${RACE_TARGET:-}" ] || printf tampered > "$RACE_TARGET"\nexit $rc\n`,
      );
      chmodSync(join(shim, tool), 0o755);
      return [tool];
    });
    assert.notEqual(shimmed.length, 0, "no hashing tool to shim");
    try {
      const result = run(["update", "--version", VERSION, "--staged", dir], {
        env: { RACE_TARGET: join(dir, ASSET) },
      });
      assert.equal(result.code, 0, result.stderr);
      assert.equal(result.installedContent, "#!/bin/sh\nexit 0\n");
    } finally {
      for (const tool of shimmed) rmSync(join(shim, tool), { force: true });
    }
  });

  it("Given no --staged, When installing, Then the asset and SHA256SUMS are still downloaded and verified as before", () => {
    const result = run(["update", "--version", VERSION]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.installed, true);
    const downloads = result.curlCalls.filter((url) => url.includes("/releases/download/"));
    assert.equal(
      downloads.some((url) => url.endsWith(`/${ASSET}`)),
      true,
    );
    assert.equal(
      downloads.some((url) => url.endsWith("/SHA256SUMS")),
      true,
    );
  });
});
