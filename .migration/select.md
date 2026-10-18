# select

2026-10-18 — strategy: transformation engine (the repo's select is a customized wrapper; the `base-nova` golden was used as the target shape, the `radix-nova` golden only to confirm what was custom). Verdict: migrated to `@base-ui/react/select`, public API unchanged, Radix Select no longer imported here.

## Changed

- `packages/design-system/src/components/ui/select.tsx`
  - `import * as SelectPrimitive from '@radix-ui/react-select'` → `import { Select as SelectPrimitive } from '@base-ui/react/select'`.
  - Part mapping: `Root`/`Group`/`Value`/`Trigger`/`Icon`/`Item`/`ItemText`/`ItemIndicator` keep their names; `Content` → `Portal > Positioner > Popup` (select.tsx:88-125), `Viewport` → `List` (select.tsx:117).
  - `Icon asChild` → `Icon render={<ChevronDown …/>}` (select.tsx:68).
  - Positioning moved to the Positioner: `side`/`sideOffset`/`align`/`alignOffset` are picked from `Positioner.Props`, destructured and forwarded (defaults keep Radix's popper values: `bottom`/`0`/`center`/`0`). Radix's `position` prop stays on the public API and maps to `alignItemWithTrigger` (`popper` → `false`, `item-aligned` → `true`) so the existing default (`popper`) is unchanged.
  - CSS variables renamed: `--radix-select-trigger-height` → `--anchor-height`, `--radix-select-trigger-width` → `--anchor-width` (select.tsx:118); Base UI sets them on the Positioner and the List inherits them.
  - Presence attributes: `data-[state=open]:*` → `data-open:*`, `data-[state=closed]:*` → `data-closed:*`, `data-[disabled]:*` → `data-disabled:*` (select.tsx:107-112, 132).
  - `Select` is now a small wrapper instead of a bare re-export (select.tsx:29-56): see Behavior changes. `onValueChange` keeps Radix's single-argument signature, so `packages/migration`, `packages/settings` call sites are untouched.
  - Types: `React.ElementRef/ComponentPropsWithoutRef<typeof Part>` → `Part.Props`.
  - Leftover scan clean: `grep -n "radix-ui\|@radix-ui" packages/design-system/src/components/ui/select.tsx` → no match.
- `packages/design-system/src/__tests__/select.test.tsx` (new) — pins the trigger label behaviour (selected item text, placeholder), keyboard open + arrow + Enter selection, and Escape closing with focus back on the trigger.

## Left alone

- Consumers: `packages/settings/src/components/ReaderSettingsPage.tsx`, `packages/settings/src/components/AppSettingsPage.tsx`, `packages/migration/src/components/MigrationPage.tsx` — no call-site edit was needed (`value`, `onValueChange`, `disabled`, `SelectTrigger id`/`aria-label`, `SelectValue placeholder`, `SelectGroup`, `SelectItem value` all keep working).
- Scroll arrows: the wrapper never rendered Radix's `ScrollUpButton`/`ScrollDownButton`, so no Base UI `ScrollUpArrow`/`ScrollDownArrow` was added; the popup keeps `overflow-hidden` exactly as before.

## Behavior changes

- BLOCKER (production SSR, out of this slice's scope): see the note in `.migration/sheet.md` — Base UI's CJS `use-sync-external-store` shim loads a second React instance in `apps/web`'s Nitro SSR bundle, so every SSR render (and therefore the production E2E) fails. The select is one of the components that triggers it.
- Trigger text: Base UI's `Select.Value` renders the raw value unless the root receives `items` (verified against `@base-ui/react@1.9.0`), while Radix rendered the selected item's text. The wrapper derives `{ value, label }` pairs from the composed `<SelectItem>` elements (plain text children only) and passes them as `items`; a caller-provided `items` always wins. An item rendered by a component of its own (not inline in the tree) is not discovered and falls back to the raw value — there is no such consumer in this repo.
- `onValueChange` is only called with a string: Base UI can emit `null` when a null-value item is selected or the value is cleared, and Radix never did, so a null value is dropped instead of being handed to a `(value: string) => void` handler.
- Modal popup: Base UI's Select is modal by default (page scroll lock, outside pointer blocking), matching Radix's behavior; no prop was added.
- Highlight styling: unchanged (`focus:`/`focus-visible:` classes still match Base UI's focused item).

## Verify by hand

- Focus the trigger, ArrowDown to open, ArrowUp/ArrowDown to move, Home/End to jump, type a few letters for typeahead, Enter to select and close, then reopen and Escape → the popup closes and focus is back on the trigger.
- Read the trigger text on the migration page: it must show the provider _name_ (e.g. MangaDex), never the raw id.
- Check the selected item still shows the check indicator and the popup keeps the trigger width.
