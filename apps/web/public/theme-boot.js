// Paints the saved theme's canvas before the first frame. Loaded as a blocking classic
// script from the document head (same-origin, so it passes `script-src 'self'`).
//
// Reads the `appearance|background|foreground` snapshot that `applyThemeToRoot` writes and
// sets only the `dark` class and `--background`/`--foreground` on the root; the real theme
// apply follows and owns the rest. The key and format mirror
// `app/features/theme/paint-snapshot.ts`; `paint-snapshot.test.ts` pins the two together.
// A blocked localStorage throws inside the microtask and is absorbed by `.catch`.
Promise.resolve()
  .then(function () {
    var raw = localStorage.getItem("mangaverse.theme.paint");
    if (typeof raw !== "string") return;
    var parts = raw.split("|");
    var appearance = parts[0];
    var background = parts[1];
    var foreground = parts[2];
    if (
      parts.length !== 3 ||
      (appearance !== "light" && appearance !== "dark") ||
      !background ||
      !foreground
    ) {
      return;
    }
    var root = document.documentElement;
    root.classList.toggle("dark", appearance === "dark");
    root.style.setProperty("--background", background);
    root.style.setProperty("--foreground", foreground);
  })
  .catch(function () {});
