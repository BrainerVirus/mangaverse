/**
 * react-doctor plugin for repo-specific conventions.
 *
 * `no-use-effect` reports every `useEffect(...)` call, including the
 * `React.useEffect(...)` member form. See AGENTS.md ("Effect Rules") for the
 * allowed alternatives and for how to record an inline disable.
 */
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
  },
};
