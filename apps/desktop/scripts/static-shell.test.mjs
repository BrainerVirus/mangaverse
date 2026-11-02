import { describe, expect, it } from "vitest";
import { externalizeInlineScripts, hasInlineScript } from "./static-shell.mjs";

const shell = [
  "<!DOCTYPE html><html><head><title>MangaVerse</title></head><body><div>app</div>",
  "<script>(function(){scrollTo(0,0)})();document.currentScript.remove()</script>",
  '<script data-tsr-stream-part="">self.$_TSR={buffer:[]};</script>',
  '<script type="module" async="" src="/assets/index-abc.js"></script>',
  "<script>document.currentScript.remove();/*$tsr-stream-boundary*/</script>",
  "</body></html>",
].join("");

describe("externalizeInlineScripts", () => {
  it("moves every inline script into a same-origin file in document order", () => {
    const { html, scripts } = externalizeInlineScripts(shell);

    expect(hasInlineScript(shell)).toBe(true);
    expect(hasInlineScript(html)).toBe(false);
    expect(scripts.map((script) => script.source)).toEqual([
      "(function(){scrollTo(0,0)})();document.currentScript.remove()",
      "self.$_TSR={buffer:[]};",
      "document.currentScript.remove();/*$tsr-stream-boundary*/",
    ]);

    const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
    expect(srcs).toEqual([
      `/${scripts[0].fileName}`,
      `/${scripts[1].fileName}`,
      "/assets/index-abc.js",
      `/${scripts[2].fileName}`,
    ]);
    expect(html).toContain('<script data-tsr-stream-part="" src="/assets/shell-inline-');
    expect(html).toContain('<script type="module" async="" src="/assets/index-abc.js"></script>');
  });

  it("names files by content hash", () => {
    const first = externalizeInlineScripts(shell).scripts;
    const second = externalizeInlineScripts(shell).scripts;
    expect(first.map((s) => s.fileName)).toEqual(second.map((s) => s.fileName));
    for (const { fileName } of first)
      expect(fileName).toMatch(/^assets\/shell-inline-[0-9a-f]{16}\.js$/);
  });

  it("refuses an inline module script", () => {
    expect(() => externalizeInlineScripts('<script type="module">import "x";</script>')).toThrow(
      /Inline module scripts/,
    );
  });
});
