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
    mutate?.(dir);
    return dir;
  }

  function run(args) {
    home = mkdtempSync(join(root, "home-"));
    writeFileSync(curlLog, "");
    const result = spawnSync("sh", [SCRIPT, ...args, "--no-launch"], {
      encoding: "utf8",
      env: {
        PATH: `${shim}:${process.env.PATH}`,
        HOME: home,
        TMPDIR: root,
        ...(process.platform === "linux" ? { XDG_DATA_HOME: join(home, ".local/share") } : {}),
      },
    });
    const status = spawnSync("sh", [SCRIPT, "status"], {
      encoding: "utf8",
      env: { HOME: home, PATH: process.env.PATH },
    });
    return {
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
    assert.match(result.stderr, /no SHA256SUMS/);
    assert.equal(result.installed, false);
  });

  it("Given a staged directory the app did not name, When installing, Then it installs and the directory is left alone", () => {
    const dir = stage("somebody-elses-dir");
    const result = run(["update", "--version", VERSION, "--staged", dir]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(existsSync(join(dir, ASSET)), true);
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
