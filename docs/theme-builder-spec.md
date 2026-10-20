# Theme builder

Status: approved design (2026-10-20, revised after review). Implementation starts with `theme-core`;
the editor shell and editors follow.

## Decisions

- **Color engine:** culori 4.x for CSS Color 4 parsing, OKLCH conversion, gamut mapping, WCAG
  contrast and CIEDE2000 difference.
- **Model:** built-in presets are frozen, fully-expanded token snapshots. Custom themes use seeds +
  derivation + overrides: users edit a small seed set, the remaining semantic tokens are derived
  with contrast targets, and advanced users can override an allow-listed token.
- **Storage:** first-class `themes` table with versioned JSON and a `themeId` migration from the
  old `presetId`.
- **Editors:** guided editor by default, an advanced tab for token-level control.
- **Accessibility:** advisory meters and one-click fixes; do not block saving without an explicit
  acknowledgement. Shipped built-ins stay frozen even where a legacy pair is below target.
- **Gamut:** author in OKLCH, gamut-map to sRGB by default, opt-in Display P3 with a warning.
- **Import/export:** JSON import/export and CSS export now; CSS import later as a strict,
  token-only whitelist because arbitrary CSS is an injection surface.
- **Validation:** Zod 4.6+ with the normal parser; issues keep their paths so the editor can mark
  the exact field. Compiled schemas are Node/CI-only: `z.compile` uses `new Function`, and the
  Electron renderer CSP has no `unsafe-eval`, so compilation is a silent fallback there. The
  renderer runs `z.config({ jitless: true })` to avoid the probe and its CSP violation report;
  `z.withParser` (build-time codegen) is the only future CSP-safe fast path.

## ThemeDefinition v1 (custom themes)

```json
{
  "schemaVersion": 1,
  "id": "custom:0f8c...",
  "name": "Amber night",
  "basedOn": "amoled-black",
  "light": {
    "seeds": { "background": "oklch(0.98 0.01 90)", "...": "..." },
    "overrides": { "--ring": "oklch(0.62 0.18 70)" }
  },
  "dark": { "seeds": { "...": "..." }, "overrides": {} }
}
```

- `id`: custom themes use `custom:<uuid>`. Built-in ids are rejected on import.
- `basedOn`: optional template id; the editor copies that template's expanded tokens into the new
  definition, so a custom theme never changes when a built-in changes.
- `seeds`: the guided surface. Every value accepts any CSS Color 4 syntax; stored canonicalized
  to OKLCH.
- `overrides`: an allow-listed map of per-token color values, applied after derivation. It cannot
  set `--glass-stage`, `--glass-sheen`, `--glass-inner`, `--radius*` or any non-color token.
- `schemaVersion`: bumped when the shape changes; migrations live with the schema.

**Schema home:** `ThemeDefinition` lives in `@app/shared` (zero dependencies) so backup validation
in `@app/shared` can use it without importing `@app/theme`. `@app/theme` and the DB consume it.

### Built-in presets

Built-ins are **not** derived at runtime. They ship as frozen, fully-expanded maps of today's CSS
variables (light and dark), so the migration is byte-identical by construction. The seed/derivation
model applies to custom themes and to "duplicate a built-in", which starts from the frozen snapshot.
`system` stays a special `themeId` resolved in the provider (follows OS appearance; `dark` is
ignored); `minimal-light` and `minimal-dark` are frozen appearance-pinned themes.

### Seeds

| Seed               | Controls                                                |
| ------------------ | ------------------------------------------------------- |
| `background`       | Page canvas                                             |
| `foreground`       | Default text                                            |
| `surface`          | Cards, popovers, raised panels                          |
| `accent`           | Hover/selected fills, sidebar chips, secondary surfaces |
| `primary`          | High-emphasis actions and brand surfaces                |
| `border`           | Borders, separators, inputs                             |
| `readerBackground` | Reader canvas                                           |
| `destructive`      | Destructive actions/errors                              |
| `success`          | Success/confirm states                                  |
| `warning`          | Caution states                                          |

### Derivation (custom themes only)

| Token                               | Rule                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `card`, `popover`                   | `surface`                                                                                                                           |
| `muted`                             | `accent`                                                                                                                            |
| `secondary`                         | `accent` mixed 12% toward `foreground` in OKLCH                                                                                     |
| `sidebar`                           | `background`                                                                                                                        |
| `sidebar-foreground`                | `foreground`                                                                                                                        |
| `sidebar-accent`                    | `accent` mixed 24% toward `foreground` in OKLCH                                                                                     |
| `ring`                              | `primary`; if it is below 3:1 against `background`, adjust `primary` lightness until it reaches 3:1 (editor fixes and explains)     |
| `input`                             | `border`                                                                                                                            |
| `*-foreground`                      | pick the highest-contrast candidate from `{background, foreground, surface, white, black}`; target 4.5:1 for text, 3:1 for non-text |
| `muted-foreground`                  | `foreground` mixed toward `background` until 4.5:1, otherwise the best candidate with a warning                                     |
| `reader-background`                 | `readerBackground`                                                                                                                  |
| `destructive/success/warning-glass` | status color gamut-mapped and contrast-checked against the regular glass fill                                                       |
| glass tiers, sheen, inner shadow    | **fixed**; never themeable beyond the documented glass fill tokens                                                                  |

Overrides win over every derived value. A custom theme may save with warnings only after the user
confirms "Save anyway"; the meter names the failing pair and offers a fix. Built-ins remain frozen.

## Color rules

- Input: any CSS Color 4 value (hex, rgb, hsl, lab, lch, oklab, oklch, `color(display-p3 ...)`).
- Canonical storage: OKLCH. The editor may show the source syntax while editing.
- WCAG contrast is computed with culori's `wcagContrast`; ΔE with `differenceCiede2000`.
- Gamut: map to sRGB by default (`toGamut`); P3 is an opt-in with a visible warning and a
  fallback preview.
- Color-blind simulation is a later preview aid, not a correctness requirement.

## Storage and migration

- `themes` table: `id` (primary key), `name`, `definition_json`, `created_at`, `updated_at`.
- Built-ins resolve from the frozen code maps first; custom themes resolve from the table.
- `ThemeSettings` becomes `{ themeId, dark }`. Validation accepts a legacy `presetId` and maps
  it to `themeId`; `presetId: 'system'` keeps its follow-OS behavior. Repositories and backups
  keep reading old rows.
- `theme-provider.tsx` migrates the existing `theme-preset-id` / `theme-dark` localStorage keys to
  `themeId` / `dark`, falling back to the default on an unknown value.
- Backups move to schema version 2: they include custom `ThemeDefinition`s and validate them with
  the shared schema. Version 1 backups (`presetId`) remain readable and are mapped.
- Importing a custom theme with an existing custom id asks replace/rename; built-in ids are
  rejected. Deleting a custom theme in use falls back to the default theme.

## Editor UX

Route: existing `/theme` gallery; `/theme/editor` (lazy) for create/edit.

### Guided

1. Start from a template card (built-ins + custom) or "Start from scratch"; templates copy a
   frozen snapshot.
2. Edit seeds: base canvas, accent hue/chroma, surface warmth, contrast level. A "surprise me"
   action picks an OKLCH harmony.
3. Live preview: scoped `data-theme` panel with app shell, reader page, cards, buttons, alerts.
4. Accessibility panel: each foreground/background pair shows a WCAG ratio and plain-language
   status ("easy to read", "needs work"); failing pairs offer a one-click fix and Save anyway.
5. Save, rename, duplicate, delete.

### Advanced

- Token groups: Surfaces, Text, Borders, Status, Reader. Glass fills are shown but the tier,
  sheen, inner shadow and stage values are read-only.
- Only allow-listed tokens can be overridden, with any CSS Color 4 value.
- Raw JSON view is editable with **inline diagnostics**:
  - JSON syntax errors at line/column;
  - Zod schema errors mapped from `issue.path` to the exact field (normal parser, not
    `z.compile` — see the validation decision);
  - the message names what is wrong and what is accepted.
- JSON import/export; CSS export. CSS import is a later, token-only whitelist: declarations of
  allowed custom properties, no selectors, at-rules, URLs or functions beyond color syntax.

### Preview

- Never applies globally until Save.
- Shows light and dark side by side; a P3 toggle when a token is out of sRGB gamut.
- Uses the same CSS-variable writer as the app, so preview and apply cannot diverge.

## Slices

1. **theme-core** — culori + Zod schema, ThemeDefinition, frozen built-ins, derivation, `themes`
   table, `themeId` migration, backup v2. No UI.
2. **theme-editor-shell** — `/theme/editor` route, scoped live preview, save/delete/duplicate,
   localStorage migration. No token controls yet.
3. **theme-guided-editor** — template/seed controls, contrast meters/fixes, Save anyway.
4. **theme-advanced-editor** — allow-listed token tab, JSON editor with Zod diagnostics, JSON
   import/export, CSS export, P3/gamut warnings.
5. **theme-accessibility** — contrast explanation polish, color-blind preview, optional CSS
   token-only import.

After 1, the **editor shell** lands; 3 and 4 then run in parallel; 5 follows.

## Out of scope

- Cloud/community sharing, per-title themes, radius/font controls in themes (colors only).
- Raw CSS import without the whitelist.
- Migrating old backups beyond the `presetId` → `themeId` mapping.
