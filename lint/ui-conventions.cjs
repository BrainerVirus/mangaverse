/**
 * oxlint JS plugin for the visual-pattern rules that @shadcn/lint does not express
 * (docs/Design.md "Cards", "Material Rules"; DESIGN.md §2.4, §7.3, §9). Loaded twice:
 *
 *  - `.oxlintrc.json` enables the rules that report nothing on the tree today, so any
 *    new use fails `pnpm lint` at once.
 *  - `.oxlintrc.ui-baseline.json` enables the rules that still report existing sites, and
 *    `lint/state-baseline.mjs` freezes those per file in `lint/ui-baseline.json`, the same
 *    way it freezes `useState`.
 *
 * Class strings are read from `className`/`class` attributes and from `cn`/`cva`/`clsx`/
 * `twMerge`/`tv` calls. A bare string constant is invisible, which is why files named
 * `*-variants.ts` (the shadcn variant maps) are read as class lists in full.
 */
const fs = require("node:fs");
const path = require("node:path");

const CLASS_HELPERS = new Set(["cn", "cva", "clsx", "twMerge", "tv"]);
const CARD_COMPONENTS = new Set(["Card", "SettingsSection"]);
const VARIANT_MAP_FILE = /-variants\.[cm]?[jt]s$/;

const workspaceRoots = new Map();

/** The nearest ancestor holding pnpm-workspace.yaml, or null. Linters run from a package too. */
function workspaceRoot(dir) {
  if (workspaceRoots.has(dir)) return workspaceRoots.get(dir);
  const parent = path.dirname(dir);
  const root = fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))
    ? dir
    : parent === dir
      ? null
      : workspaceRoot(parent);
  workspaceRoots.set(dir, root);
  return root;
}

/**
 * The linted file relative to the repo root (or the working directory outside a workspace), with
 * forward slashes, so `packages/reader/...` scoping holds when react-doctor lints one package.
 */
function relativeFile(context) {
  const filename = context.filename ?? context.getFilename();
  const root = workspaceRoot(path.dirname(filename)) ?? context.cwd ?? process.cwd();
  return path.relative(root, filename).split(path.sep).join("/");
}

/** Splits `hover:data-[side=top]:p-4` into its variants and the utility, ignoring `:` in brackets. */
function parseToken(token) {
  const variants = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i += 1) {
    const char = token[i];
    if (char === "[") depth += 1;
    else if (char === "]") depth -= 1;
    else if (char === ":" && depth === 0) {
      variants.push(token.slice(start, i));
      start = i + 1;
    }
  }
  const utility = token
    .slice(start)
    .replace(/^[!-]+/, "")
    .replace(/!$/, "");
  return { variants: variants.join(":"), utility, raw: token };
}

function tokensOf(text) {
  return text.split(/\s+/).filter(Boolean).map(parseToken);
}

function isClassString(text) {
  // A cooked template quasi can be a fragment ("rounded-", " mt-2"); only whole words count.
  return typeof text === "string" && text.trim() !== "";
}

/** Every string literal and template quasi below `node`, skipping the `parent` back-link. */
function collectStrings(node, out = []) {
  if (!node || typeof node.type !== "string") return out;
  if (node.type === "Literal" && typeof node.value === "string")
    out.push({ node, text: node.value });
  else if (node.type === "TemplateElement") out.push({ node, text: node.value.cooked ?? "" });
  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    const child = node[key];
    if (Array.isArray(child)) for (const item of child) collectStrings(item, out);
    else if (child && typeof child === "object") collectStrings(child, out);
  }
  return out;
}

function calleeName(callee) {
  if (callee.type === "Identifier") return callee.name;
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
  )
    return callee.property.name;
  return null;
}

function jsxName(nameNode) {
  if (nameNode.type === "JSXIdentifier") return nameNode.name;
  if (nameNode.type === "JSXMemberExpression") return nameNode.property.name;
  return null;
}

const MAX_GROUPS = 256;
const STRUCTURAL = new Set([
  "Program",
  "ExpressionStatement",
  "VariableDeclaration",
  "VariableDeclarator",
  "ExportNamedDeclaration",
  "ExportDefaultDeclaration",
  "BlockStatement",
  "ReturnStatement",
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
  "JSXAttribute",
  "SequenceExpression",
]);

/** Unwraps the nodes that only wrap an expression. */
function unwrap(node) {
  while (
    node &&
    (node.type === "JSXExpressionContainer" ||
      node.type === "ParenthesizedExpression" ||
      node.type === "TSAsExpression" ||
      node.type === "TSSatisfiesExpression" ||
      node.type === "TSNonNullExpression")
  )
    node = node.expression;
  return node;
}

/** Alternatives that can both be true: every pair, so the classes of one render stay together. */
function product(left, right) {
  // Past the cap, keep the branches apart: that can only miss a pair, never invent one.
  if (left.length * right.length > MAX_GROUPS) return left.concat(right);
  const out = [];
  for (const a of left) for (const b of right) out.push(a.concat(b));
  return out;
}

const productAll = (lists) => lists.reduce(product, [[]]);
/**
 * The class strings of one carrier, as sets of strings that are known to apply to one element
 * together ("groups"). Only unconditional composition combines:
 *
 * - `cn`/`clsx`/`twMerge` arguments, array elements and template parts are additive;
 * - a `cva`/`tv` call is its base plus one option from each variant axis. Options within one axis
 *   are alternatives, independent axes combine (bounded by MAX_GROUPS);
 * - anything conditional (`?:`, `&&`, `||`, `??`, a `clsx` object key, a compound variant) cannot be
 *   proven to coexist with its siblings, so each operand is a group on its own. `cn(open && 'border',
 *   !open && 'ring-1')` therefore pairs nothing, and neither does `cn('border', open && 'ring-1')`.
 *
 * Returns `{ groups, solo }`: `groups` combine with the surrounding additive context, `solo` groups
 * stand alone.
 */
function collectGroups(input) {
  const node = unwrap(input);
  const nothing = { groups: [[]], solo: [] };
  if (!node || typeof node.type !== "string") return nothing;

  // A conditional operand: its strings count by themselves, never beside a sibling.
  const alone = (...parts) => {
    const solo = [];
    for (const part of parts) {
      for (const group of part.groups) if (group.length > 0) solo.push(group);
      solo.push(...part.solo);
    }
    return { groups: [[]], solo };
  };
  const additive = additiveOf;
  const of = (child) => collectGroups(child.type === "SpreadElement" ? child.argument : child);

  switch (node.type) {
    case "Literal":
      return typeof node.value === "string" && isClassString(node.value)
        ? { groups: [[{ node, text: node.value }]], solo: [] }
        : nothing;
    case "TemplateLiteral": {
      const parts = [];
      node.quasis.forEach((quasi, index) => {
        const text = quasi.value.cooked ?? "";
        if (isClassString(text)) parts.push({ groups: [[{ node: quasi, text }]], solo: [] });
        const expression = node.expressions[index];
        if (expression) parts.push(collectGroups(expression));
      });
      return additive(parts);
    }
    case "ArrayExpression":
      return additive(node.elements.filter(Boolean).map(of));
    case "ConditionalExpression":
      return alone(collectGroups(node.consequent), collectGroups(node.alternate));
    case "LogicalExpression":
      return alone(collectGroups(node.left), collectGroups(node.right));
    case "CallExpression": {
      const name = calleeName(node.callee);
      if (name === "cva") {
        const [base, config] = node.arguments;
        return additive([base ? of(base) : nothing, config ? variantConfig(config) : nothing]);
      }
      if (name === "tv") return node.arguments[0] ? variantConfig(node.arguments[0]) : nothing;
      const args = node.arguments.map(of);
      return name && CLASS_HELPERS.has(name) ? additive(args) : alone(...args);
    }
    case "ObjectExpression":
      // A clsx object (keys are the classes) or a plain map of options: either way conditional.
      return alone(...objectParts(node));
    default: {
      // Only containers are searched (a variant-map file is read from its Program). A comparison
      // such as `variant === 'outline'` holds a string that is a value, not a class.
      if (!STRUCTURAL.has(node.type)) return nothing;
      const parts = [];
      for (const key of Object.keys(node)) {
        if (key === "parent" || key === "loc" || key === "range") continue;
        const child = node[key];
        for (const item of Array.isArray(child) ? child : [child])
          if (item && typeof item.type === "string") parts.push(collectGroups(item));
      }
      return alone(...parts);
    }
  }
}

function additiveOf(parts) {
  return {
    groups: productAll(parts.map((part) => part.groups)),
    solo: parts.flatMap((part) => part.solo),
  };
}

/** The parts of an object literal: class-bearing values, else the string keys (clsx style). */
function objectParts(node) {
  const parts = [];
  for (const property of node.properties) {
    if (property.type !== "Property") continue;
    const value = collectGroups(property.value);
    const carriesClasses = value.groups.some((group) => group.length > 0) || value.solo.length > 0;
    if (carriesClasses) parts.push(value);
    else if (
      !property.computed &&
      property.key.type === "Literal" &&
      typeof property.key.value === "string" &&
      isClassString(property.key.value)
    )
      parts.push({ groups: [[{ node: property.key, text: property.key.value }]], solo: [] });
  }
  return parts;
}

const keyName = (property) =>
  property.computed
    ? null
    : property.key.type === "Identifier"
      ? property.key.name
      : typeof property.key.value === "string"
        ? property.key.value
        : null;

/** A cva/tv config: `base` plus one option per axis of `variants`; compound variants stand alone. */
function variantConfig(input) {
  const config = unwrap(input);
  if (!config || config.type !== "ObjectExpression") return collectGroups(config);
  const parts = [];
  const solo = [];
  for (const property of config.properties) {
    if (property.type !== "Property") continue;
    const name = keyName(property);
    const value = unwrap(property.value);
    if (name === "base") parts.push(collectGroups(value));
    else if (name === "variants" && value?.type === "ObjectExpression") {
      for (const axis of value.properties) {
        const options = unwrap(axis.value);
        if (axis.type !== "Property" || options?.type !== "ObjectExpression") continue;
        // Options within an axis exclude each other; each option may itself hold alternatives.
        const alternatives = [];
        for (const option of options.properties) {
          if (option.type !== "Property") continue;
          const collected = collectGroups(option.value);
          alternatives.push(...collected.groups);
          solo.push(...collected.solo);
        }
        parts.push({ groups: alternatives.length > 0 ? alternatives : [[]], solo: [] });
      }
    } else if (name === "compoundVariants") {
      const collected = collectGroups(value);
      for (const group of collected.groups) if (group.length > 0) solo.push(group);
      solo.push(...collected.solo);
    }
  }
  const combined = additiveOf(parts);
  return { groups: combined.groups, solo: solo.concat(combined.solo) };
}

/** Every group of a carrier, flat: the combinable groups and the standalone ones. */
function classGroups(input) {
  const { groups, solo } = collectGroups(input);
  return groups.filter((group) => group.length > 0).concat(solo);
}

/**
 * Builds a rule from a function that inspects one class carrier. `check` receives
 * `{ entries, tokens, groups, report }`: `entries` are the carrier's string literals (each its own
 * class list), `tokens` is every parsed token across all of them, and `groups` are the sets of
 * entries that can apply to one element together (see classGroups), for rules about a combination.
 */
function classRule({ check, files }) {
  return {
    create(context) {
      const filename = relativeFile(context);
      if (files && !files(filename)) return {};
      const seen = new WeakSet();

      function inspect(root) {
        const strings = collectStrings(root).filter(({ node, text }) => {
          if (seen.has(node) || !isClassString(text)) return false;
          seen.add(node);
          return true;
        });
        if (strings.length === 0) return;
        const parsed = new Map();
        const entryOf = ({ node, text }) => {
          if (!parsed.has(node)) parsed.set(node, { node, tokens: tokensOf(text) });
          return parsed.get(node);
        };
        const entries = strings.map(entryOf);
        const tokens = entries.flatMap((entry) => entry.tokens);
        check({
          entries,
          tokens,
          groups: classGroups(root).map((group) => group.map(entryOf)),
          report: (node, message) => context.report({ node, message }),
        });
      }

      const visitor = {
        JSXAttribute(node) {
          if (node.name.type !== "JSXIdentifier") return;
          if (node.name.name !== "className" && node.name.name !== "class") return;
          if (node.value) inspect(node.value);
        },
        CallExpression(node) {
          const name = calleeName(node.callee);
          if (name && CLASS_HELPERS.has(name)) inspect(node);
        },
      };
      if (VARIANT_MAP_FILE.test(filename)) {
        visitor.Program = (node) => inspect(node);
      }
      return visitor;
    },
  };
}

const APPS_AND_NON_READER = (file) =>
  !/(^|\/)packages\/reader\//.test(file) &&
  !/(^|\/)packages\/design-system\/src\/components\/reader-/.test(file);

// Feature code: the places a panel is composed from primitives, as opposed to the primitives.
const CONSUMER_FILE = /(^|\/)(apps|packages\/extensions)\//;

const rules = {
  "no-transition-all": classRule({
    check({ entries, report }) {
      for (const { node, tokens } of entries) {
        for (const { utility, raw } of tokens) {
          if (utility === "transition-all" || utility === "transition") {
            report(
              node,
              `"${raw}" transitions an unrestricted set of properties. Specify the intended properties instead.`,
            );
          }
        }
      }
    },
  }),
  /**
   * docs/Design.md "Cards": a Card is content, never a layout container. Reports a `Card` or
   * `SettingsSection` nested in another one in the same file, directly or through components
   * defined in that file, however many wrappers deep (the render graph is followed with a visited
   * set, so a recursive component ends). Cross-file nesting is invisible to a linter.
   */
  "no-nested-card": {
    create(context) {
      const rendersCard = new Set(); // local components whose body holds a Card directly
      const uses = new Map(); // local component -> local components it renders
      const nestedUses = []; // JSX usages sitting inside a Card
      const enclosingComponent = (node) => {
        for (let current = node.parent; current; current = current.parent) {
          if (current.type === "FunctionDeclaration" && current.id) return current.id.name;
          if (
            current.type === "VariableDeclarator" &&
            current.id.type === "Identifier" &&
            /^[A-Z]/.test(current.id.name) &&
            current.init &&
            /Function|CallExpression/.test(current.init.type)
          )
            return current.id.name;
        }
        return null;
      };
      // The chain of local components from `name` down to one that renders a Card, or null.
      const cardChain = (name, visited = new Set()) => {
        if (rendersCard.has(name)) return [name];
        visited.add(name);
        for (const used of uses.get(name) ?? []) {
          if (visited.has(used)) continue;
          const chain = cardChain(used, visited);
          if (chain) return [name, ...chain];
        }
        return null;
      };
      return {
        JSXOpeningElement(node) {
          const name = jsxName(node.name);
          if (!name) return;
          const owner = enclosingComponent(node);
          if (owner) {
            if (CARD_COMPONENTS.has(name)) rendersCard.add(owner);
            else if (/^[A-Z]/.test(name) && node.name.type === "JSXIdentifier") {
              if (!uses.has(owner)) uses.set(owner, new Set());
              uses.get(owner).add(name);
            }
          }
          for (let current = node.parent.parent; current; current = current.parent) {
            if (current.type !== "JSXElement") continue;
            const ancestor = jsxName(current.openingElement.name);
            if (ancestor && CARD_COMPONENTS.has(ancestor)) {
              if (CARD_COMPONENTS.has(name)) {
                context.report({
                  node,
                  message: `<${name}> is nested in <${ancestor}>. Cards are content, not layout: use a heading and spacing for a section, and keep one border per grouping (docs/Design.md "Cards").`,
                });
              } else {
                nestedUses.push({ node, name, ancestor });
              }
              break;
            }
          }
        },
        "Program:exit"() {
          for (const { node, name, ancestor } of nestedUses) {
            const chain = cardChain(name);
            if (chain) {
              context.report({
                node,
                message: `<${name}> renders a Card${chain.length > 1 ? ` (via ${chain.join(" > ")})` : ""} and sits inside <${ancestor}>. Cards are content, not layout: flatten one of them (docs/Design.md "Cards").`,
              });
            }
          }
        },
      };
    },
  },

  /**
   * docs/Design.md "Component Rules / shadcn/ui Usage": translucency starts at GlassSurface.
   * No hand-written backdrop filter or translucent white/black fill outside the reader stage,
   * whose documented `bg-white/25` rail track and `text-white` type are reader-only.
   */
  "no-hand-rolled-glass": classRule({
    files: APPS_AND_NON_READER,
    check({ entries, report }) {
      for (const { node, tokens } of entries) {
        for (const { utility } of tokens) {
          if (/^backdrop-/.test(utility) || /^bg-(white|black)\/\d+$/.test(utility)) {
            report(
              node,
              `"${utility}" hand-writes a glass layer. Start from GlassSurface/GlassPanel and pick a tier (DESIGN.md §2.1).`,
            );
          }
        }
      }
    },
  }),

  /**
   * docs/Design.md "Spacing": siblings are separated by `gap-*` on a flex or grid parent. Tailwind's
   * `space-x-*`/`space-y-*` write a margin on every child but the last (`> :not(:last-child)`), so
   * they skip inline children, double up with a child's own margin or a `gap`, and break when a
   * child is hidden, reordered or `display: contents`. Reports every `space-x|y-*`, the `-0` resets
   * and `-reverse` included, in primitives as well as features (the header and footer stacks of
   * Card, Dialog and Sheet are `gap-*` too).
   */
  "no-space-utilities": classRule({
    check({ entries, report }) {
      for (const { node, tokens } of entries) {
        for (const { utility, variants, raw } of tokens) {
          const match = utility.match(/^space-([xy])-(.+)$/);
          if (!match) continue;
          const [, axis, value] = match;
          const prefix = variants === "" ? "" : `${variants}:`;
          const fix =
            value === "reverse"
              ? "reverse the order with flex-col-reverse or flex-row-reverse"
              : axis === "y"
                ? `flex flex-col ${prefix}gap-${value}`
                : `flex ${prefix}gap-${value}`;
          report(
            node,
            `"${raw}" is a margin stack. Put the spacing on a flex or grid parent: ${fix} (docs/Design.md "Spacing").`,
          );
        }
      }
    },
  }),

  /**
   * DESIGN.md §2.4: depth is the four-step elevation scale (shadow-sm|md|lg|xl). Tailwind's
   * remaining shadows (bare `shadow`, `shadow-xs|2xs|2xl|inner`, `drop-shadow-*`) compile to
   * light-mode values outside that scale and show as dirt in dark mode.
   */
  "no-off-scale-shadow": classRule({
    check({ entries, report }) {
      for (const { node, tokens } of entries) {
        for (const { utility } of tokens) {
          if (/^(shadow|shadow-(2xs|xs|2xl|inner)|drop-shadow(-.+)?)$/.test(utility)) {
            report(
              node,
              `"${utility}" is outside the elevation scale. Use shadow-sm, shadow-md, shadow-lg or shadow-xl (DESIGN.md §2.4).`,
            );
          }
        }
      }
    },
  }),

  /**
   * DESIGN.md frontmatter `rounded`: box 10, control 7, button 8, badge pill, glass 14. Tailwind's
   * own steps (`rounded`, `rounded-sm|md|lg|xl|2xl|3xl`) put a fifth radius beside them and make
   * one component mix corner radii. `rounded-full` and `rounded-none` stay legal.
   */
  "no-off-scale-radius": classRule({
    check({ entries, report }) {
      for (const { node, tokens } of entries) {
        for (const { utility } of tokens) {
          if (/^rounded(-[trblse]{1,2})?(-(xs|sm|md|lg|xl|2xl|3xl|4xl))?$/.test(utility)) {
            report(
              node,
              `"${utility}" is a Tailwind default radius. Use rounded-box, rounded-control, rounded-btn, rounded-badge or rounded-glass (DESIGN.md frontmatter "rounded").`,
            );
          }
        }
      }
    },
  }),

  /**
   * One border per visual grouping (docs/Design.md "Cards"): a resting `border` plus a resting
   * `ring-1|2|4|8` (or `outline-1|2`) draws two outlines on one element. Focus rings carry a
   * `focus*:` variant and stay legal.
   *
   * Conservative on purpose: a pair is reported only when both utilities are unconditional in one
   * carrier (plain strings, array elements, template parts, additive `cn` arguments) or are chosen
   * together by a cva/tv call (its base plus one option from each variant axis). Operands of `?:`,
   * `&&`, `||`, `??`, clsx object keys and compound variants are never paired with a sibling, because
   * a linter cannot prove `open && 'border'` and `!open && 'ring-1'` can both apply. So
   * `cn('border', open && 'ring-1')` is not reported, though it can double.
   */
  "no-border-ring-doubling": classRule({
    check({ groups, report }) {
      const reported = new Set();
      for (const group of groups) {
        const resting = group.flatMap(({ node, tokens }) =>
          tokens.filter(({ variants }) => variants === "").map((token) => ({ ...token, node })),
        );
        const border = resting.find(({ utility }) =>
          /^border(-[xytrblse])?(-[0-9]+)?$/.test(utility),
        );
        const ring = resting.find(({ utility }) =>
          /^(ring(-[1-9][0-9]*)?|outline(-[1-9][0-9]*)?)$/.test(utility),
        );
        if (!border || !ring) continue;
        const key = border.node.start ?? border.node.range?.[0];
        if (reported.has(key)) continue;
        reported.add(key);
        report(
          border.node,
          `"${border.raw}" and "${ring.raw}" draw two outlines on one element. Keep one: a border, or a ring; a focus ring belongs behind focus-visible: (docs/Design.md "Cards").`,
        );
      }
    },
  }),

  /**
   * DESIGN.md §6.2: every hover state has a focus equivalent, and focus is a 2px ring on
   * `:focus-visible`. A link, button or router Link that styles `hover:` needs the element's own
   * visible focus treatment: a `focus`, `focus-visible` or `focus-within` utility (not
   * `group-focus`/`peer-focus`, which style an element the keyboard is not on) that shows:
   *
   * - a ring with a width (`ring`, `ring-2`, `ring-[3px]`; a colour or an offset alone draws nothing),
   * - an outline with a width or style (not `none`, `hidden` or `0`),
   * - or a fill, text colour, border colour, shadow, opacity, transform, underline or decoration.
   *
   * `buttonVariants(...)` and `buttonVariants.<member>` count as focus-bearing: they are the design
   * system's own maps, which carry the ring. No other helper is trusted by name; `cva(...)`/`tv(...)`
   * count through the focus utilities written in their arguments. `focus:outline-none` alone or a
   * `className` prop does not exempt the element.
   */
  "no-hover-without-focus": {
    create(context) {
      const CONTROLS = new Set(["a", "button", "Link"]);
      const own = (variants) =>
        variants
          .split(":")
          .some((v) => v === "focus" || v === "focus-visible" || v === "focus-within");
      const width = "(?:[1-9][0-9]*|\\[[0-9.]*[1-9][0-9.]*px\\])";
      const VISIBLE_FOCUS = [
        new RegExp(`^ring(?:-${width})?$`),
        new RegExp(`^outline(?:-${width}|-solid|-dashed|-dotted|-double)?$`),
        /^bg-(?!transparent$|none$|clip-|origin-|size-|position-|repeat|fixed$|local$|scroll$).+$/,
        /^text-(?!inherit$|transparent$|xs$|sm$|base$|lg$|[0-9]?xl$|left$|center$|right$|justify$|start$|end$|wrap$|nowrap$|balance$|pretty$|ellipsis$|clip$).+$/,
        /^border(?:-(?!transparent$|solid$|dashed$|dotted$|double$|none$|hidden$|collapse$|separate$|spacing).+)?$/,
        /^shadow(?:-(?!none$).+)?$/,
        /^(?:opacity|translate|scale|decoration)-.+$/,
        /^underline$/,
      ];
      const KNOWN_VARIANTS = "buttonVariants";
      const bearsKnownVariants = (root) => {
        let found = false;
        (function walk(node) {
          if (found || !node || typeof node.type !== "string") return;
          if (node.type === "CallExpression" && calleeName(node.callee) === KNOWN_VARIANTS)
            found = true;
          if (
            node.type === "MemberExpression" &&
            node.object.type === "Identifier" &&
            node.object.name === KNOWN_VARIANTS
          )
            found = true;
          for (const key of Object.keys(node)) {
            if (key === "parent" || key === "loc" || key === "range") continue;
            const child = node[key];
            for (const item of Array.isArray(child) ? child : [child]) walk(item);
          }
        })(root);
        return found;
      };
      return {
        JSXOpeningElement(node) {
          if (node.name.type !== "JSXIdentifier" || !CONTROLS.has(node.name.name)) return;
          const attr = node.attributes.find(
            (a) => a.type === "JSXAttribute" && a.name.name === "className" && a.value,
          );
          if (!attr) return;
          const tokens = collectStrings(attr.value).flatMap(({ text }) => tokensOf(text));
          const hover = tokens.find(
            ({ variants, utility }) =>
              /(^|:)hover$/.test(variants) &&
              /^(bg|text|border|ring|shadow|underline)/.test(utility),
          );
          if (!hover) return;
          if (bearsKnownVariants(attr.value)) return;
          const focused = tokens.filter(({ variants }) => own(variants));
          if (focused.some(({ utility }) => VISIBLE_FOCUS.some((pattern) => pattern.test(utility))))
            return;
          const hidden = focused.find(({ utility }) => /^outline-(none|hidden)$/.test(utility));
          const ignored = tokens.find(
            ({ variants, utility }) =>
              /focus/.test(variants) && !own(variants) && /^(ring|outline)/.test(utility),
          );
          context.report({
            node,
            message: hidden
              ? `"${hidden.raw}" hides the focus indicator on this <${node.name.name}> and nothing visible replaces it. Add focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2, or use buttonVariants (DESIGN.md §6.2).`
              : `"${hover.raw}" has no visible focus state of its own on this <${node.name.name}>${ignored ? ` ("${ignored.raw}" styles another element, and a ring needs a width)` : ""}, so keyboard focus shows the browser outline instead of the 2px ring. Add focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2, or use buttonVariants (DESIGN.md §6.2).`,
          });
        },
      };
    },
  },

  /**
   * DESIGN.md §4: a heading is one of the `type-*` roles (size, weight, tracking and line height
   * together). A heading element that sets `text-{xs..4xl}` or a weight by hand drifts from its
   * siblings: section headings in the library alone use text-base, text-lg and text-xl.
   */
  "no-hand-rolled-heading": {
    create(context) {
      const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
      return {
        JSXOpeningElement(node) {
          if (node.name.type !== "JSXIdentifier" || !HEADINGS.has(node.name.name)) return;
          const attr = node.attributes.find(
            (a) => a.type === "JSXAttribute" && a.name.name === "className" && a.value,
          );
          if (!attr) return;
          const tokens = collectStrings(attr.value).flatMap(({ text }) => tokensOf(text));
          // A type role that carries a weight tweak is still on the scale; the size is what drifts.
          if (tokens.some(({ utility }) => /^type-/.test(utility))) return;
          const hand = tokens.find(({ utility }) =>
            /^(text-(xs|sm|base|lg|xl|[2-9]xl)|font-(medium|semibold|bold))$/.test(utility),
          );
          if (hand) {
            context.report({
              node,
              message: `"${hand.raw}" sets heading typography by hand on <${node.name.name}>. Use a type role: type-display-lg, type-title or type-heading (DESIGN.md §4 "Type roles & scale").`,
            });
          }
        },
      };
    },
  },

  /**
   * AGENTS.md "Motion Rules" / DESIGN.md §5: motion ships through `@app/design-system/motion`, which
   * owns the DURATION and EASING tokens and the reduced-motion path. A component that imports `gsap`
   * itself writes its own milliseconds and ease strings.
   */
  "no-direct-gsap-import": {
    create(context) {
      if (/(^|\/)packages\/design-system\/src\/motion\//.test(relativeFile(context))) return {};
      return {
        ImportDeclaration(node) {
          const source = node.source.value;
          if (source === "gsap" || (typeof source === "string" && source.startsWith("gsap/"))) {
            context.report({
              node,
              message: `Import motion helpers from @app/design-system/motion instead of "${source}". Durations and easings come from DURATION and EASING (AGENTS.md "Motion Rules").`,
            });
          }
        },
      };
    },
  },

  /**
   * Icons and squares are sized with one `size-N`; `h-N w-N` pairs are the same value written
   * twice and make the icon scale hard to audit. Only an identical pair with the same variant
   * prefix is reported.
   */
  "prefer-size-utility": classRule({
    check({ entries, report }) {
      for (const { node, tokens } of entries) {
        const heights = new Map();
        for (const { utility, variants } of tokens) {
          const match = utility.match(/^h-(.+)$/);
          if (match) heights.set(`${variants}|${match[1]}`, utility);
        }
        for (const { utility, variants } of tokens) {
          const match = utility.match(/^w-(.+)$/);
          if (
            match &&
            !/^(full|screen|auto|fit|min|max)$/.test(match[1]) &&
            heights.has(`${variants}|${match[1]}`)
          ) {
            report(node, `"h-${match[1]} w-${match[1]}" is one square: write size-${match[1]}.`);
          }
        }
      }
    },
  }),

  /**
   * docs/Design.md "Component Rules": prefer Card/Alert/Empty/GlassPanel over custom markup. A host
   * element (`div`, `li`, `p`, `section`, `ul`, `dl`) that carries a radius, a fill or a resting
   * border, and its own padding, is a panel written by hand; every copy drifts (p-2/p-3/px-3 py-2,
   * bg-muted/30|40|50). Interactive hosts (`button`, `a`, `label`, `input`) are controls, not panels.
   */
  "no-hand-built-panel": {
    create(context) {
      if (!CONSUMER_FILE.test(relativeFile(context))) return {};
      const HOSTS = new Set(["div", "li", "p", "section", "ul", "dl", "article", "aside"]);
      return {
        JSXOpeningElement(node) {
          if (node.name.type !== "JSXIdentifier" || !HOSTS.has(node.name.name)) return;
          const attr = node.attributes.find(
            (a) => a.type === "JSXAttribute" && a.name.name === "className" && a.value,
          );
          if (!attr) return;
          const tokens = collectStrings(attr.value).flatMap(({ text }) => tokensOf(text));
          const resting = tokens.filter(({ variants }) => variants === "");
          const radius = resting.some(({ utility }) =>
            /^rounded-(box|control|glass)$/.test(utility),
          );
          const fill = resting.some(({ utility }) =>
            /^bg-(muted|card|surface|accent)(\/\d+)?$/.test(utility),
          );
          const border = resting.some(({ utility }) => /^border(-[0-9]+)?$/.test(utility));
          const padding = resting.some(({ utility }) => /^p[xy]?-/.test(utility));
          if (radius && (fill || border) && padding) {
            context.report({
              node,
              message:
                "This <" +
                node.name.name +
                '> is a hand-built panel (radius + fill/border + padding). Use Card, Alert, GlassPanel or an Empty state, or add one shared row primitive to @app/design-system instead of another copy (docs/Design.md "Component Rules").',
            });
          }
        },
      };
    },
  },

  /**
   * ListRow owns its fill, border, radius, shadow and padding. A consumer may add layout,
   * gap between children and typography; a resting fill, border or padding override
   * reintroduces the one-off panel the primitive replaced.
   */
  "no-list-row-overrides": {
    create(context) {
      if (!CONSUMER_FILE.test(relativeFile(context))) return {};
      return {
        JSXOpeningElement(node) {
          if (node.name.type !== "JSXIdentifier" || node.name.name !== "ListRow") return;
          const attr = node.attributes.find(
            (a) => a.type === "JSXAttribute" && a.name.name === "className" && a.value,
          );
          if (!attr) return;
          const tokens = collectStrings(attr.value).flatMap(({ text }) => tokensOf(text));
          const override = tokens.find(({ utility }) =>
            /^(bg-|border|rounded|shadow|ring|outline|p[xytrbl]?-)/.test(utility),
          );
          if (override === undefined) return;
          context.report({
            node,
            message: `"${override.utility}" is not allowed on <ListRow>: <ListRow> owns its fill, border, radius, shadow and padding. Use a tone or padding, or put spacing on the parent.`,
          });
        },
      };
    },
  },

  /**
   * An outlined ListRow inside a Card or SettingsSection draws a second border in the same
   * grouping (docs/Design.md "Cards"). Rows inside a card use the muted/plain tones or a
   * divide-y list; the rule follows same-file JSX ancestors only.
   */
  "no-outlined-row-in-card": {
    create(context) {
      if (!CONSUMER_FILE.test(relativeFile(context))) return {};
      return {
        JSXOpeningElement(node) {
          if (node.name.type !== "JSXIdentifier" || node.name.name !== "ListRow") return;
          const tone = node.attributes.find(
            (a) => a.type === "JSXAttribute" && a.name.name === "tone",
          );
          if (
            tone === undefined ||
            tone.value === null ||
            tone.value.type !== "Literal" ||
            tone.value.value !== "outline"
          ) {
            return;
          }
          let ancestor = node.parent?.parent ?? null;
          while (ancestor !== null) {
            if (
              ancestor.type === "JSXElement" &&
              ancestor.openingElement.name.type === "JSXIdentifier" &&
              CARD_COMPONENTS.has(ancestor.openingElement.name.name)
            ) {
              context.report({
                node,
                message:
                  'An outlined <ListRow> inside a Card or SettingsSection draws a second border in one grouping. Use tone="muted" or tone="plain", or a divide-y list.',
              });
              return;
            }
            ancestor = ancestor.parent ?? null;
          }
        },
      };
    },
  },

  /** Muted rows are tiles, not list separators, inside a settings section. */
  "no-filled-row-in-settings": {
    create(context) {
      if (!CONSUMER_FILE.test(relativeFile(context))) return {};
      return {
        JSXOpeningElement(node) {
          if (node.name.type !== "JSXIdentifier" || node.name.name !== "ListRow") return;
          const tone = node.attributes.find(
            (attribute) => attribute.type === "JSXAttribute" && attribute.name.name === "tone",
          );
          if (tone && (tone.value?.type !== "Literal" || tone.value.value !== "muted")) return;
          for (let ancestor = node.parent?.parent; ancestor; ancestor = ancestor.parent) {
            if (
              ancestor.type === "JSXElement" &&
              ancestor.openingElement.name.type === "JSXIdentifier" &&
              ancestor.openingElement.name.name === "SettingsSection"
            ) {
              context.report({
                node,
                message:
                  "A muted <ListRow> inside <SettingsSection> creates a nested tile. Use a divided list or a plain row; keep stateful warnings distinct.",
              });
              return;
            }
          }
        },
      };
    },
  },

  /**
   * A class map that is a plain string constant (the shadcn `*-variants.ts` files) is invisible to
   * @shadcn/lint, so arbitrary values slip through there. Reports `prop-[value]` in those files.
   */
  "no-arbitrary-in-variant-maps": {
    create(context) {
      const filename = context.filename ?? context.getFilename();
      if (!VARIANT_MAP_FILE.test(filename)) return {};
      return {
        Program(node) {
          for (const { node: at, text } of collectStrings(node)) {
            for (const { utility } of tokensOf(text)) {
              if (/^[a-z][a-z0-9-]*-\[.+\]$/.test(utility)) {
                context.report({
                  node: at,
                  message: `"${utility}" is an arbitrary value in a variant map. Use the token class (rounded-btn, rounded-control, ring-ring, border-border) the way the rest of the design system does.`,
                });
              }
            }
          }
        },
      };
    },
  },
};

module.exports = { meta: { name: "ui-conventions" }, rules };
