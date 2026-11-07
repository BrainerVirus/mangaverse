import { chromium } from "/Users/cristhoferpincetti/.local/share/opencode/worktree/3f8de6/ui-loaders-audit/apps/web/node_modules/@playwright/test/index.mjs";

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-features=OverlayScrollbar"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const logs = [];
page.on("console", (m) => logs.push(`console:${m.type()}:${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror:${e.message}`));
await page.goto("http://127.0.0.1:5199/onboarding", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await page.waitForTimeout(6000);
console.log("URL", page.url());
console.log("BODY", (await page.locator("body").innerText()).slice(0, 500));
console.log("LOGS", logs.slice(0, 30).join("\n"));
const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
console.log("IDB", dbs);
const styles = await page.evaluate(() => ({
  htmlWidth: getComputedStyle(document.documentElement).scrollbarWidth,
  htmlColor: getComputedStyle(document.documentElement).scrollbarColor,
  innerWidth: window.innerWidth,
  clientWidth: document.documentElement.clientWidth,
  scrollHeight: document.documentElement.scrollHeight,
  clientHeight: document.documentElement.clientHeight,
  main: (() => {
    const m = document.querySelector("main#main-content");
    if (!m) return null;
    const s = getComputedStyle(m);
    return {
      scrollbarWidth: s.scrollbarWidth,
      scrollbarColor: s.scrollbarColor,
      gutter: s.scrollbarGutter,
      scrolls: m.scrollHeight - m.clientHeight,
      clientWidth: m.clientWidth,
      offsetWidth: m.offsetWidth,
    };
  })(),
}));
console.log("STYLES", JSON.stringify(styles, null, 2));
await page.screenshot({
  path: "/Users/cristhoferpincetti/.local/share/opencode/worktree/3f8de6/ui-loaders-audit/tla/scrollbar-probe.png",
});
await browser.close();
