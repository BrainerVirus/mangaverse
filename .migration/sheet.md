# sheet

2026-10-18 — strategy: transformation engine (the repo's sheet is a customized wrapper: the `radix-nova` golden differs from it, so nothing was replayed; the `base-nova` golden was used as the target shape). Verdict: migrated to `@base-ui/react/dialog`, public API unchanged, Radix Dialog no longer imported here.

## Changed

- `packages/design-system/src/components/ui/sheet.tsx`
  - `import * as SheetPrimitive from '@radix-ui/react-dialog'` → `import { Dialog as SheetPrimitive } from '@base-ui/react/dialog'`.
  - Part mapping: `Overlay` → `Backdrop` (sheet.tsx:20), `Content` → `Popup` (sheet.tsx:85). `Root`, `Portal`, `Close`, `Title`, `Description` keep their names.
  - Animation hooks moved to Base UI presence attributes: `data-[state=open]:*` → `data-open:*`, `data-[state=closed]:*` → `data-closed:*` on the backdrop (sheet.tsx:23) and on all four `sideClasses` variants (sheet.tsx:34-41). The tw-animate-css classes themselves are untouched, so the slide/fade look is the same.
  - Types: `React.ComponentRef/ComponentPropsWithoutRef<typeof Content>` → `SheetPrimitive.Popup.Props`; `Title`/`Description` props now come from Base UI.
  - `onEscapeKeyDown` (a Radix-only prop that this wrapper used to intercept so the reader's window-level Escape listener never saw the key) stays in the public props and is forwarded from a `onKeyDown` on the Popup (sheet.tsx:100-104); the close itself plus the propagation stop now come from Base UI's dismissal.
  - `onCloseAutoFocus` (Radix-only) stays in the public props and is translated to Base UI's `finalFocus` (sheet.tsx:73-83): `preventDefault()` maps to "do not move focus" (`finalFocus` returns `false`), otherwise the default focus restore runs.
  - `aria-modal="true"` is set on the popup (sheet.tsx:99): Base UI hides the rest of the page from assistive tech instead of marking the popup, and Radix emitted the attribute, so the public a11y surface keeps it. A caller can override it for a non-modal sheet.
  - Leftover scan clean: `grep -n "radix-ui\|@radix-ui" packages/design-system/src/components/ui/sheet.tsx` → no match.

## Left alone

- `packages/design-system/src/components/ui/dialog.tsx` — the sibling dialog wrapper imports no Radix package at all (plain divs, consumer-managed open state); see `.migration/dialog.md`.
- `packages/design-system/src/components/ui/command.tsx` (cmdk) — not Radix, untouched per the skill's hard rule.
- Every consumer (`apps/web/app/components/shell/MobileBottomNav.tsx`, `packages/reader/src/components/reader-settings-sheet.tsx`) — no call-site change was needed: `Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle`/`SheetDescription` props, `side`, `aria-label` and the two Radix focus/Escape hooks keep working.

## Behavior changes

- `aria-modal`: Base UI's modal dialog does not emit `aria-modal` (it marks the rest of the page instead), Radix did. The wrapper sets `aria-modal="true"` so the accessible contract is unchanged; it stays overridable via the popup props.
- Escape propagation: Base UI's dismissal calls `stopPropagation()` when the close is not cancelled, which is what the wrapper's explicit `event.stopPropagation()` did before. Net effect unchanged (the reader layout's window listener does not toggle the chrome while the sheet closes), but the stop now happens in the primitive, not in our handler.
- Exit animation: Base UI keeps the popup mounted until its animation ends (`data-closed` + animation-end detection) instead of Radix's own unmount timing. Visually identical; the popup is removed from the DOM after the same ~200 ms fade.
- Focus restore on close: unchanged target (the trigger, or the previously focused element), now applied through `finalFocus`.

## Verify by hand

- Reader: focus the `Settings` button with the keyboard, press Enter, Tab through the sheet, press Escape → the sheet closes, the reader chrome stays visible, and focus is back on `Settings`.
- Mobile nav: open the "More" sheet from the bottom nav, click the backdrop and the close (X) → both close it; the focus ring lands on the trigger.
- Check the four `side` values slide from the correct edge and fade in/out on close.
