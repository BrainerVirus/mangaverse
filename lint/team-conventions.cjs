/**
 * react-doctor plugin for repo-specific conventions, also loaded by oxlint
 * through `.oxlintrc.baseline.json`.
 *
 * `no-use-effect` reports every `useEffect(...)` call, including the
 * `React.useEffect(...)` member form. See AGENTS.md ("Effect Rules") for the
 * allowed alternatives and for how to record an inline disable.
 *
 * `no-use-state` and `no-try-catch` are banned outright; `lint/state-baseline.mjs`
 * freezes the existing uses per file in `lint/baseline.json`
 * (docs/overhaul/01-engineering-rules.md E1).
 */
function isUseStateString(node) {
  if (node.type === "Literal") return node.value === "useState";
  return (
    node.type === "TemplateLiteral" &&
    node.expressions.length === 0 &&
    node.quasis[0].value.cooked === "useState"
  );
}

module.exports = {
  meta: { name: "team-conventions" },
  rules: {
    "no-use-effect": {
      create(context) {
        return {
          CallExpression(node) {
            const { callee } = node;
            const isIdentifier = callee.type === "Identifier" && callee.name === "useEffect";
            const isMember =
              callee.type === "MemberExpression" &&
              !callee.computed &&
              callee.property.type === "Identifier" &&
              callee.property.name === "useEffect";
            if (!isIdentifier && !isMember) return;
            context.report({
              node,
              message:
                "Do not use useEffect. Derive the value, handle it in the event handler, use useSyncExternalStore, useGSAP, or reset with a key.",
            });
          },
        };
      },
    },
    "no-use-state": {
      create(context) {
        const localNames = new Set(["useState"]);
        return {
          ImportDeclaration(node) {
            if (node.source.value !== "react") return;
            for (const specifier of node.specifiers) {
              if (specifier.type === "ImportSpecifier" && specifier.imported.name === "useState") {
                localNames.add(specifier.local.name);
              }
            }
          },
          CallExpression(node) {
            const { callee } = node;
            const isIdentifier = callee.type === "Identifier" && localNames.has(callee.name);
            const isMember =
              callee.type === "MemberExpression" &&
              (callee.computed
                ? isUseStateString(callee.property)
                : callee.property.type === "Identifier" && callee.property.name === "useState");
            if (!isIdentifier && !isMember) return;
            context.report({
              node,
              message:
                "Do not add useState. Use useStateReducer from @app/design-system for local UI state, TanStack Query for provider data, or Zustand for shared client state.",
            });
          },
        };
      },
    },
    "no-try-catch": {
      create(context) {
        return {
          TryStatement(node) {
            if (!node.handler) return;
            context.report({
              node,
              message:
                "Do not add try/catch. Let the failure propagate to a boundary that handles it, or model it with Effect in an I/O module.",
            });
          },
        };
      },
    },
  },
};
