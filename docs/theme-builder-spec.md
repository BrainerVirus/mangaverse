# Theme builder

Status: approved design (2026-10-20). Implementation starts with `theme-core`; the editors follow.

## Decisions

- **Color engine:** culori 4.x for CSS Color 4 parsing, OKLCH conversion, gamut mapping, WCAG
  contrast and CIEDE2000 difference.
- **Model:** seeds + derivation + overrides. Users edit a small set of seeds; the rest of the
  semantic tokens are derived with contrast targets; advanced users can override any token.
- **Storage:** first-class `themes` table with versioned JSON and a `themeId` migration from the
  old `presetId`.
- **Editors:** guided editor by default, an advanced tab for token-level control.
- **Accessibility:** advisory meters and one-click fixes; do not block saving.
- **Gamut:** author in OKLCH, gamut-map to sRGB by default, opt-in Display P3 with a warning.
- **Import/export:** JSON import/export and CSS export now; CSS import later as a strict,
  token-only whitelist because arbitrary CSS is an injection surface.
- **Validation:** Zod 4.6+ with `z.compile` for the hot theme-definition path; issues keep their
  paths so the editor can mark the exact field.

## ThemeDefinition v1

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

- `id`: built-in presets keep their existing ids; custom themes use `custom:<uuid>`.
- `basedOn`: optional template id, used by the editor for "Duplicate"; not required to resolve.
- `seeds`: the guided surface. Every value accepts any CSS Color 4 syntax; stored canonicalized
  to OKLCH.
- `overrides`: advanced per-CSS-variable values, applied after derivation.
- `schemaVersion`: bumped when the shape changes; migrations live with the schema.

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

### Derivation (deterministic)

| Token                               | Rule                                                                |
| ----------------------------------- | ------------------------------------------------------------------- |
| `card`, `popover`                   | `surface`                                                           |
| `muted`                             | `accent`                                                            |
| `secondary`                         | accent mixed 12% toward foreground (OKLCH)                          |
| `sidebar`, `sidebar-foreground`     | background/surface + contrast-safe foreground                       |
| `sidebar-accent`                    | accent mixed 24% toward foreground                                  |
| `ring`                              | accent, gamut-mapped and contrast-checked                           |
| `input`                             | border                                                              |
| `*-foreground`                      | the seed that clears the WCAG AA floor against its surface          |
| `glass-*`                           | surface/status seeds mapped into the glass fills for the appearance |
| `reader-background`                 | `readerBackground`                                                  |
| `destructive/success/warning-glass` | status color gamut-mapped and checked against the glass fill        |

Overrides win over every derived value. Built-in presets must keep byte-identical output after
the migration; custom themes may differ.

## Color rules

- Input: any CSS Color 4 value (hex, rgb, hsl, lab, lch, oklab, oklch, `color(display-p3 ...)`).
- Canonical storage: OKLCH. The editor may show the source syntax while editing.
- WCAG contrast is computed with culori's `wcagContrast`; ΔE with `differenceCiede2000`.
- Gamut: map to sRGB by default (`toGamut`); P3 is an opt-in with a visible warning and a
  fallback preview.
- Color-blind simulation is a later preview aid, not a correctness requirement.

## Storage and migration

- `themes` table: `id` (primary key), `name`, `definition_json`, `created_at`, `updated_at`.
- Built-ins resolve from code first; custom themes resolve from the table.
- `ThemeSettings` becomes `{ themeId, dark }`. Validation accepts a legacy `presetId` and maps
  it to `themeId`; repositories and backups keep reading old rows.
- Backups include custom theme definitions and validate them with the same schema; a backup with
  only `presetId` is accepted and mapped.
- Deleting a custom theme in use falls back to the default theme.

## Editor UX

Route: `/settings/theme` gallery, `/settings/theme/editor` (lazy) for create/edit.

### Guided

1. Start from a template card (built-ins + custom) or "Start from scratch".
2. Edit seeds: base canvas, accent hue/chroma, surface warmth, contrast level. A "surprise me"
   action picks an OKLCH harmony.
3. Live preview: scoped `data-theme` panel with app shell, reader page, cards, buttons, alerts.
4. Accessibility panel: each foreground/background pair shows a WCAG ratio and plain-language
   status ("easy to read", "needs work"); failing pairs offer a one-click fix.
5. Save, rename, duplicate, delete.

### Advanced

- Token groups: Surfaces, Text, Borders, Status, Reader, Glass.
- Any token can be overridden with any CSS Color 4 value.
- Raw JSON view is editable with **inline diagnostics**:
  - JSON syntax errors at line/column;
  - Zod schema errors mapped from `issue.path` to the exact field;
  - the message names what is wrong and what is accepted.
- JSON import/export; CSS export. CSS import is a later, token-only whitelist: declarations of
  allowed custom properties, no selectors, at-rules, URLs or functions beyond color syntax.

### Preview

- Never applies globally until Save.
- Shows light and dark side by side; a P3 toggle when a token is out of sRGB gamut.
- Uses the same CSS-variable writer as the app, so preview and apply cannot diverge.

## Slices

1. **theme-core** — culori + Zod schema/compiled validation, ThemeDefinition, derivation,
   built-in migration, `themes` table, themeId migration, backup. No UI.
2. **theme-guided-editor** — gallery, template/duplicate, seed controls, live preview, contrast
   meters/fixes, save/delete.
3. **theme-advanced-editor** — advanced token tab, JSON editor with Zod diagnostics, JSON
   import/export, CSS export, P3/gamut warnings.
4. **theme-accessibility** — contrast explanation polish, color-blind preview, optional CSS
   token-only import.

Slices 2 and 3 run in parallel after 1; 4 follows.

## Out of scope

- Cloud/community sharing, per-title themes, radius/font controls in themes (colors only).
- Raw CSS import without the whitelist.
- Migrating old backups beyond the `presetId` → `themeId` mapping.
