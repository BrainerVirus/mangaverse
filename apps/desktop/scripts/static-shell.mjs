import { createHash } from "node:crypto";

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/**
 * The prerendered shell carries TanStack's bootstrap as inline classic scripts, which the
 * production CSP (`script-src 'self'`) refuses. Move each one into a same-origin file and
 * reference it with a classic `src` script in the same place: parsing still blocks on it in
 * order, and `document.currentScript` still points at the tag.
 *
 * @param {string} html
 * @returns {{ html: string, scripts: { fileName: string, source: string }[] }}
 */
export function externalizeInlineScripts(html) {
  const scripts = [];
  const output = html.replace(SCRIPT_RE, (tag, attrs, body) => {
    if (/\bsrc\s*=/i.test(attrs)) return tag;
    if (/\btype\s*=\s*["']?module/i.test(attrs)) {
      throw new Error("Inline module scripts are not supported in the static shell");
    }
    const hash = createHash("sha256").update(body).digest("hex").slice(0, 16);
    const fileName = `assets/shell-inline-${hash}.js`;
    if (!scripts.some((script) => script.fileName === fileName)) {
      scripts.push({ fileName, source: body });
    }
    return `<script${attrs} src="/${fileName}"></script>`;
  });
  return { html: output, scripts };
}

/** @param {string} html */
export function hasInlineScript(html) {
  for (const match of html.matchAll(SCRIPT_RE)) {
    if (!/\bsrc\s*=/i.test(match[1]) || match[2].trim() !== "") return true;
  }
  return false;
}
