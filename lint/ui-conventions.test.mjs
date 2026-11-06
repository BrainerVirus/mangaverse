// Red and green fixtures for lint/ui-conventions.cjs and for the @shadcn/lint rules that guard the
// same patterns, run through oxlint the way `pnpm lint` runs them. Each rule has a fixture that must
// fail and one that must pass; the last block checks the tree against lint/ui-baseline.json.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { after, before, describe, it } from "node:test";
import { ROOT, selectProfile } from "./state-baseline.mjs";

const OXLINT_BIN = join(ROOT, "node_modules/oxlint/bin/oxlint");
const BASELINE_CONFIG = JSON.parse(
  readFileSync(join(ROOT, ".oxlintrc.ui-baseline.json"), "utf8").replace(/^\s*\/\/.*$/gm, ""),
);

function oxlint(config, targets) {
  const { status, stdout, stderr, error } = spawnSync(
    process.execPath,
    [OXLINT_BIN, "-c", config, "--disable-nested-config", "--format", "json", ...targets],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (error) throw error;
  assert.ok(status === 0 || status === 1, `oxlint exited ${status}:\n${stderr}${stdout}`);
  return JSON.parse(stdout).diagnostics.map((diagnostic) => ({
    rule: diagnostic.code,
    file: diagnostic.filename,
    line: diagnostic.labels[0]?.span.line ?? 0,
    message: diagnostic.message,
  }));
}

// One JSX element per line from the fourth line on (inside a fragment), so a test can name a case
// by its index.
const elements = (cases) =>
  `export function A() {\n  return (\n    <>\n${cases.map((c) => `      ${c}`).join("\n")}\n    </>\n  );\n}\n`;
const lineOf = (cases, wanted) => wanted.map((c) => cases.indexOf(c) + 4);

const BORDER_RED = [
  `<div className={cn('border', 'ring-1')} />`,
  `<div className={cn(['border', open && 'ring-1'])} />`,
  "<div className={`border ${gap} ring-1`} />",
  `<div className={cn('border', { 'ring-1': active })} />`,
  `<div className={cn('border', open ? 'ring-1' : 'ring-2')} />`,
  `<div className={clsx('rounded-box', ['p-4', 'border-b'], 'outline-2')} />`,
  `<div className={cn(a || 'border', b || 'ring-1')} />`,
];
const BORDER_GREEN = [
  `<div className={open ? 'border' : 'ring-1'} />`,
  `<div className={cn(open ? 'border' : 'ring-1', 'p-4')} />`,
  `<div className={cn((open && 'border') || 'ring-1')} />`,
  `<div className={cn('border', variant === 'outline' && 'p-2')} />`,
  `<div className={cva('p-4', { variants: { tone: { a: 'border', b: 'ring-1' } } })} />`,
  `<div className={cn('border', 'focus-visible:ring-2', { 'hover:ring-1': active })} />`,
];
const HOVER_RED = [
  `<button className="hover:bg-accent focus:outline-none" />`,
  `<a className={cn('hover:bg-accent', className)} />`,
  `<a className={className ?? 'hover:underline'} />`,
  `<Link className="hover:text-foreground focus-visible:ring-0" />`,
  `<button className="hover:bg-accent focus-visible:outline-none focus-visible:ring-offset-2" />`,
];
const HOVER_GREEN = [
  `<button className="hover:bg-accent focus-visible:ring-2" />`,
  `<a className={cn(buttonVariants({ variant: 'ghost' }), className)} />`,
  `<a className={cn(buttonVariants.outline, 'hover:bg-accent')} />`,
  `<a className={cn(cva('hover:bg-accent'), className)} />`,
  `<button className="hover:bg-accent focus:bg-accent" />`,
  `<button className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" />`,
  `<button className="p-2 focus:outline-none" />`,
];

describe("ui-conventions rules", () => {
  let dir;
  let rel;

  // path -> source, under the fixture root so the path-scoped rules see apps/, packages/reader/, ...
  const files = {
    "apps/web/app/nested-card.tsx": `import { Card, CardContent, SettingsSection } from '@app/design-system';
function Inner() {
  return <Card>inner</Card>;
}
export function A() {
  return (
    <Card>
      <CardContent>
        <Card>direct</Card>
        <SettingsSection title="t">section</SettingsSection>
        <Inner />
      </CardContent>
    </Card>
  );
}
`,
    "apps/web/app/flat-cards.tsx": `import { Card, CardContent, CardHeader } from '@app/design-system';
function Inner() {
  return <p>no card here</p>;
}
export function A() {
  return (
    <>
      <Card>
        <CardHeader>one</CardHeader>
        <CardContent>
          <Inner />
        </CardContent>
      </Card>
      <Card>two</Card>
    </>
  );
}
`,
    "apps/web/app/glass.tsx": `export function A() {
  return (
    <div className="backdrop-blur-md">
      <p className="bg-black/80 text-foreground" />
      <p className={cn('bg-white/10', 'p-4')} />
    </div>
  );
}
`,
    "packages/reader/src/stage.tsx": `export function A() {
  return <div className="h-2 bg-white/25 backdrop-blur-sm" />;
}
`,
    "apps/web/app/solid.tsx": `export function A() {
  return <div className="bg-black p-4 text-white" />;
}
`,
    "apps/web/app/border-ring.tsx": `export function A() {
  return (
    <>
      <div className="rounded-box border border-border ring-1 ring-border" />
      <div className="border outline-2" />
    </>
  );
}
`,
    "apps/web/app/border-focus.tsx": `export function A() {
  return (
    <>
      <input className="border border-border focus-visible:ring-2 focus-visible:ring-ring" />
      <div className="ring-1 ring-border" />
      <div className="border-b border-border" />
    </>
  );
}
`,
    "apps/web/app/scales.tsx": `export function A() {
  return (
    <>
      <div className="rounded-lg shadow-2xl" />
      <div className="rounded shadow drop-shadow-md" />
      <div className="h-4 w-4 md:h-6 md:w-6" />
      <h2 className="text-lg font-semibold">Heading</h2>
    </>
  );
}
`,
    "apps/web/app/scales-ok.tsx": `export function A() {
  return (
    <>
      <div className="rounded-box shadow-md rounded-full rounded-none" />
      <div className="size-4 h-4 w-6 w-full h-full" />
      <h2 className="type-heading">Heading</h2>
      <h3 className="type-body-lg font-medium">Role with a weight</h3>
      <p className="text-lg">not a heading</p>
    </>
  );
}
`,
    "apps/web/app/panels.tsx": `export function A() {
  return (
    <>
      <p className="rounded-box border border-border px-4 py-6 text-sm">Nothing here</p>
      <li className="rounded-control bg-muted/40 p-3" />
    </>
  );
}
`,
    "apps/web/app/panels-ok.tsx": `export function A() {
  return (
    <>
      <div className="rounded-box bg-muted" />
      <div className="p-4" />
      <button className="rounded-control border border-border p-2" />
      <label className="rounded-control border border-border p-2" />
    </>
  );
}
`,
    "packages/design-system/src/components/panel-in-primitive.tsx": `export function A() {
  return <div className="rounded-box border border-border p-4" />;
}
`,
    "apps/web/app/border-composed.tsx": elements(BORDER_RED),
    "apps/web/app/border-exclusive.tsx": elements(BORDER_GREEN),
    "apps/web/app/hover-invisible.tsx": elements(HOVER_RED),
    "apps/web/app/hover-visible.tsx": elements(HOVER_GREEN),
    "apps/web/app/nested-deep.tsx": `import { Card } from '@app/design-system';
function Inner() {
  return <Card>inner</Card>;
}
function Middle() {
  return <Inner />;
}
function Ping() {
  return <Pong />;
}
function Pong() {
  return <Ping />;
}
export function A() {
  return (
    <Card>
      <Middle />
      <Ping />
    </Card>
  );
}
`,
    "apps/web/app/hover.tsx": `export function A() {
  return (
    <>
      <a className="rounded-control px-3 hover:bg-accent" />
      <button className="hover:text-foreground focus-visible:ring-2" />
      <a className={cn(buttonVariants.outline)} />
      <Link className="hover:underline" />
    </>
  );
}
`,
    "apps/web/app/gsap.tsx": `import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
export const a = [gsap, Flip];
`,
    "packages/design-system/src/motion/helper.ts": `import { gsap } from 'gsap';
export const a = gsap;
`,
    "packages/design-system/src/components/ui/thing-variants.ts": `export const base = 'inline-flex rounded-[var(--radius-btn)] ring-[var(--ring)] [&_svg]:size-4';
export const sizes = { sm: \`h-9 \${base} border-[var(--border)]\` } as const;
`,
    "packages/design-system/src/components/ui/clean-variants.ts": `export const base = 'inline-flex rounded-btn ring-ring [&_svg]:size-4 data-[side=top]:p-4';
`,
  };

  const found = new Map();
  const at = (name, rule) =>
    (found.get(name) ?? []).filter((d) => d.rule === `ui-conventions(${rule})`).map((d) => d.line);

  before(() => {
    dir = mkdtempSync(join(ROOT, "lint/.fixture-ui-"));
    rel = relative(ROOT, dir);
    for (const [name, source] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), source);
    }
    const everything = {
      ...BASELINE_CONFIG,
      rules: {
        ...BASELINE_CONFIG.rules,
        "ui-conventions/no-nested-card": "error",
        "ui-conventions/no-hand-rolled-glass": "error",
        "ui-conventions/no-border-ring-doubling": "error",
      },
      jsPlugins: [join(ROOT, "lint/ui-conventions.cjs")],
    };
    writeFileSync(join(dir, "oxlintrc.json"), JSON.stringify(everything));
    for (const diagnostic of oxlint(join(dir, "oxlintrc.json"), [rel])) {
      const name = relative(dir, diagnostic.file);
      found.set(name, [...(found.get(name) ?? []), diagnostic]);
    }
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("no-nested-card fails a Card, a SettingsSection and a same-file wrapper inside a Card", () => {
    assert.deepEqual(at("apps/web/app/nested-card.tsx", "no-nested-card"), [9, 10, 11]);
  });

  it("no-nested-card passes sibling cards and a component that renders no card", () => {
    assert.deepEqual(at("apps/web/app/flat-cards.tsx", "no-nested-card"), []);
  });

  it("no-hand-rolled-glass fails backdrop filters and translucent black or white fills", () => {
    assert.deepEqual(at("apps/web/app/glass.tsx", "no-hand-rolled-glass"), [3, 4, 5]);
  });

  it("no-hand-rolled-glass leaves the reader stage and solid fills alone", () => {
    assert.deepEqual(at("packages/reader/src/stage.tsx", "no-hand-rolled-glass"), []);
    assert.deepEqual(at("apps/web/app/solid.tsx", "no-hand-rolled-glass"), []);
  });

  it("no-border-ring-doubling fails a resting border with a resting ring or outline", () => {
    assert.deepEqual(at("apps/web/app/border-ring.tsx", "no-border-ring-doubling"), [4, 5]);
  });

  it("no-border-ring-doubling fails a border and a ring composed in cn, an array, a template or an object", () => {
    assert.deepEqual(
      at("apps/web/app/border-composed.tsx", "no-border-ring-doubling"),
      lineOf(BORDER_RED, BORDER_RED),
    );
  });

  it("no-border-ring-doubling passes ternary and || alternatives, comparisons and cva options", () => {
    assert.deepEqual(at("apps/web/app/border-exclusive.tsx", "no-border-ring-doubling"), []);
  });

  it("no-border-ring-doubling passes a focus ring, a ring alone and a one-sided border", () => {
    assert.deepEqual(at("apps/web/app/border-focus.tsx", "no-border-ring-doubling"), []);
  });

  it("no-off-scale-radius, no-off-scale-shadow, prefer-size-utility and no-hand-rolled-heading fail", () => {
    const name = "apps/web/app/scales.tsx";
    assert.deepEqual(at(name, "no-off-scale-radius"), [4, 5]);
    assert.deepEqual(at(name, "no-off-scale-shadow"), [4, 5, 5]);
    assert.deepEqual(at(name, "prefer-size-utility"), [6, 6]);
    assert.deepEqual(at(name, "no-hand-rolled-heading"), [7]);
  });

  it("the scale rules pass tokens, rounded-full, unequal h/w pairs, roles and non-headings", () => {
    const diagnostics = found.get("apps/web/app/scales-ok.tsx") ?? [];
    assert.deepEqual(
      diagnostics.map((d) => `${d.line} ${d.rule}`),
      [],
    );
  });

  it("no-hand-built-panel fails a host element with radius, fill or border and padding", () => {
    assert.deepEqual(at("apps/web/app/panels.tsx", "no-hand-built-panel"), [4, 5]);
  });

  it("no-hand-built-panel passes controls, unpadded boxes and the design-system primitives", () => {
    assert.deepEqual(at("apps/web/app/panels-ok.tsx", "no-hand-built-panel"), []);
    assert.deepEqual(
      at("packages/design-system/src/components/panel-in-primitive.tsx", "no-hand-built-panel"),
      [],
    );
  });

  it("no-hover-without-focus fails invisible focus and a className prop that proves nothing", () => {
    assert.deepEqual(
      at("apps/web/app/hover-invisible.tsx", "no-hover-without-focus"),
      lineOf(HOVER_RED, HOVER_RED),
    );
  });

  it("no-hover-without-focus passes a styled focus state and variant helpers", () => {
    assert.deepEqual(at("apps/web/app/hover-visible.tsx", "no-hover-without-focus"), []);
  });

  it("no-nested-card follows wrappers transitively and ends on a render cycle", () => {
    assert.deepEqual(at("apps/web/app/nested-deep.tsx", "no-nested-card"), [17]);
    assert.match(
      found.get("apps/web/app/nested-deep.tsx")[0].message,
      /<Middle> renders a Card \(via Middle > Inner\)/,
    );
  });

  it("no-hover-without-focus fails a hand-built control and passes one with a focus state or variants", () => {
    assert.deepEqual(at("apps/web/app/hover.tsx", "no-hover-without-focus"), [4, 7]);
  });

  it("no-direct-gsap-import fails gsap and its subpaths outside the motion module", () => {
    assert.deepEqual(at("apps/web/app/gsap.tsx", "no-direct-gsap-import"), [1, 2]);
    assert.deepEqual(
      at("packages/design-system/src/motion/helper.ts", "no-direct-gsap-import"),
      [],
    );
  });

  it("no-arbitrary-in-variant-maps reads plain string constants in *-variants.ts files", () => {
    const name = "packages/design-system/src/components/ui/thing-variants.ts";
    assert.deepEqual(at(name, "no-arbitrary-in-variant-maps"), [1, 1, 2]);
    assert.deepEqual(
      at(
        "packages/design-system/src/components/ui/clean-variants.ts",
        "no-arbitrary-in-variant-maps",
      ),
      [],
    );
  });
});

// The repo config is what `pnpm lint` runs, so these fixtures prove the rules are wired in and at
// error, including the @shadcn/lint ones the audit relies on.
describe("the repo oxlint config", () => {
  let dir;
  let rel;
  let diagnostics;
  const red = `import { Button, Card } from '@app/design-system';
export function Red() {
  return (
    <Card>
      <Card className="bg-white/10 backdrop-blur-md border ring-1" />
      <Button className="p-[13px] bg-red-500 bg-[#fff]" style={{ padding: 13, color: '#fff' }} />
    </Card>
  );
}
`;
  const green = `import { Button, Card, CardContent } from '@app/design-system';
export function Green() {
  return (
    <Card className="mt-4">
      <CardContent>
        <Button className="mt-2" size="sm">Save</Button>
      </CardContent>
    </Card>
  );
}
`;

  before(() => {
    dir = mkdtempSync(join(ROOT, "lint/.fixture-ui-repo-"));
    rel = relative(ROOT, dir);
    mkdirSync(join(dir, "apps/web/app"), { recursive: true });
    writeFileSync(join(dir, "apps/web/app/red.tsx"), red);
    writeFileSync(join(dir, "apps/web/app/green.tsx"), green);
    diagnostics = oxlint(".oxlintrc.json", [rel]);
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  const rulesOf = (name) =>
    new Set(diagnostics.filter((d) => d.file.endsWith(name)).map((d) => d.rule));

  it("fails the red fixture on the three enforced ui-conventions rules", () => {
    const rules = rulesOf("red.tsx");
    for (const rule of ["no-nested-card", "no-hand-rolled-glass", "no-border-ring-doubling"]) {
      assert.ok(rules.has(`ui-conventions(${rule})`), `${rule} missing from ${[...rules]}`);
    }
  });

  it("fails the red fixture on the shadcn restyle, arbitrary value, raw colour and inline style rules", () => {
    const rules = rulesOf("red.tsx");
    for (const rule of ["no-restyle", "no-arbitrary-values", "no-raw-colors", "no-inline-styles"]) {
      assert.ok(rules.has(`shadcn(${rule})`), `${rule} missing from ${[...rules]}`);
    }
  });

  it("passes the green fixture", () => {
    assert.deepEqual(
      diagnostics.filter((d) => d.file.endsWith("green.tsx")).map((d) => d.rule),
      [],
    );
  });
});

// Runs the real script with --profile ui in a throwaway repo: a new use fails, a fixed one asks for
// a shrink, and the committed baseline cannot be raised.
describe("the ui profile, through the script", () => {
  const SOURCE = 'export const A = () => <div className="rounded-lg" />;\n';
  let dir;
  let base;

  const git = (...args) => {
    const { status, stderr, stdout } = spawnSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args],
      { cwd: dir, encoding: "utf8" },
    );
    assert.equal(status, 0, stderr);
    return stdout.trim();
  };

  function write(baseline, source = SOURCE) {
    writeFileSync(join(dir, "lint/ui-baseline.json"), JSON.stringify(baseline));
    writeFileSync(join(dir, "apps/a.tsx"), source);
  }

  function check(...args) {
    const env = { ...process.env, WORKIT_BASELINE_BASE: base };
    delete env.GITHUB_BASE_REF;
    return spawnSync(process.execPath, ["lint/state-baseline.mjs", "--profile", "ui", ...args], {
      cwd: dir,
      env,
      encoding: "utf8",
    });
  }

  const frozen = { "apps/a.tsx": { "no-off-scale-radius": 1 } };

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "ui-baseline-run-"));
    for (const sub of ["lint", "apps", "packages"]) mkdirSync(join(dir, sub));
    for (const file of [
      "lint/state-baseline.mjs",
      "lint/ui-conventions.cjs",
      ".oxlintrc.ui-baseline.json",
    ]) {
      copyFileSync(join(ROOT, file), join(dir, file));
    }
    symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"));
    writeFileSync(join(dir, ".gitignore"), "node_modules\n");
    writeFileSync(join(dir, "vitest.config.ts"), "export default {};\n");
    git("init", "-q");
    write(frozen);
    git("add", "-A");
    git("commit", "-qm", "base");
    base = git("rev-parse", "HEAD");
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("passes the frozen use", () => {
    const { status, stdout } = check();
    assert.equal(status, 0);
    assert.match(stdout, /1 frozen uses in 1 files match/);
  });

  it("fails a use the baseline does not hold, naming the file and the rule", () => {
    write({}, 'export const A = () => <div className="rounded-lg" />;\n');
    const { status, stderr } = check();
    assert.equal(status, 1);
    assert.match(stderr, /apps\/a\.tsx: 1 no-off-scale-radius, baseline allows 0/);
  });

  it("fails a fixed use until the baseline is shrunk, with the ui script named", () => {
    write(frozen, 'export const A = () => <div className="rounded-box" />;\n');
    const { status, stderr } = check();
    assert.equal(status, 1);
    assert.match(stderr, /baseline still says 1\. Run: pnpm lint:ui-baseline --shrink/);
    assert.equal(check("--shrink").status, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "lint/ui-baseline.json"), "utf8")), {});
  });

  it("fails a raised count against the committed baseline", () => {
    write(
      { "apps/a.tsx": { "no-off-scale-radius": 2 } },
      `${SOURCE}${SOURCE.replace("A =", "B =")}`,
    );
    const { status, stderr } = check();
    assert.equal(status, 1);
    assert.match(
      stderr,
      /lint\/ui-baseline\.json: apps\/a\.tsx no-off-scale-radius is 2, \w+ has 1\./,
    );
  });

  it("ignores a disable comment for a baselined rule and reports it", () => {
    write(
      frozen,
      '// oxlint-disable-next-line ui-conventions/no-off-scale-radius\nexport const A = () => <div className="rounded-lg" />;\n',
    );
    const { status, stderr } = check();
    assert.equal(status, 1);
    assert.match(stderr, /disable comment hides/);
  });
});

describe("lint/ui-baseline.json", () => {
  it("matches the tree, so a new use of a baselined rule or a stale count fails", () => {
    selectProfile("ui");
    const { status, stdout, stderr } = spawnSync(
      process.execPath,
      [join(ROOT, "lint/state-baseline.mjs"), "--profile", "ui"],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.equal(status, 0, `${stdout}${stderr}`);
    assert.match(stdout, /state-baseline: \d+ frozen uses in \d+ files match\./);
  });

  it("rejects an unknown profile and refuses to overwrite an existing baseline", () => {
    const unknown = spawnSync(
      process.execPath,
      [join(ROOT, "lint/state-baseline.mjs"), "--profile", "nope"],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /unknown profile nope/);
    const init = spawnSync(
      process.execPath,
      [join(ROOT, "lint/state-baseline.mjs"), "--profile", "ui", "--init"],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.equal(init.status, 1);
    assert.match(init.stderr, /--init only writes a missing baseline/);
  });
});
