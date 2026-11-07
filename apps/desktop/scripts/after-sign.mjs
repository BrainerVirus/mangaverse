import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// electron-builder `afterSign` hook (apps/desktop/electron-builder.yml).
//
// Why this exists: the `electronFuses` block rewrites bytes inside the Electron Framework
// binary. That invalidates the signature Electron ships with, and Apple Silicon kills a process
// that maps a page whose signature no longer matches (SIGKILL at launch, "invalid signed page").
// electron-builder flips the fuses and then signs, so a build with no signing identity (v0.0.1
// is unsigned, CSC_IDENTITY_AUTO_DISCOVERY=false) is left with a broken bundle.
//
// Order matters: `afterPack` runs BEFORE the fuses are flipped, so it cannot repair this. This
// hook runs after the fuses and after electron-builder's own signing step, and before the DMG
// and ZIP are built.
//
// What it does: when the .app does not already verify, it ad-hoc signs it (`--sign -`). That is
// not a Developer ID signature and does not notarize; it only makes the modified bundle valid
// so it can run. When a real identity signed the app, the bundle verifies and this hook leaves
// it alone, so adding certificates later needs no change here.
//
// No `--options runtime`: an ad-hoc signature has no Team ID, and the hardened runtime's
// library validation then refuses to load the (equally ad-hoc) Electron Framework ("mapping
// process and mapped file have different Team IDs") and the app dies in dyld. Hardened runtime
// only matters for notarization, and the real-identity path still gets it from
// `mac.hardenedRuntime` in electron-builder.yml.

const entitlements = fileURLToPath(new URL("../build/entitlements.mac.plist", import.meta.url));

function codesign(args) {
  return execFileSync("codesign", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// A non-zero exit is the answer here, not an error: spawnSync reports it instead of throwing.
function verifies(app) {
  return spawnSync("codesign", ["--verify", "--deep", "--strict", app]).status === 0;
}

export default async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") return;

  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);

  if (verifies(app)) {
    console.log(`after-sign: ${app} already has a valid signature; leaving it as is`);
    return;
  }

  console.log(`after-sign: ad-hoc signing ${app} (the fuses invalidated its signature)`);
  codesign(["--force", "--deep", "--sign", "-", "--entitlements", entitlements, app]);

  // Fail the build rather than ship a bundle the kernel will kill.
  codesign(["--verify", "--deep", "--strict", app]);
  console.log("after-sign: ad-hoc signature verified");
}
