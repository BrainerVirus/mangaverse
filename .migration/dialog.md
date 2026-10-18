# dialog

2026-10-18 — strategy: none (there was nothing to transform). Verdict: **not migrated** — `dialog.tsx` imports no Radix package; it is a plain-div overlay wrapper.

## Changed

- Nothing in `packages/design-system/src/components/ui/dialog.tsx`. It contains no `@radix-ui/*` import: `Dialog` is a `<div className="fixed inset-0 z-50 flex items-center justify-center">` and `DialogContent`/`DialogHeader`/`DialogFooter`/`DialogTitle`/`DialogDescription` are plain elements. The repo's only Radix dialog-family usage was `sheet.tsx` (`@radix-ui/react-dialog`), migrated in `.migration/sheet.md`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" packages/design-system/src/components/ui/dialog.tsx` → no match.

## Left alone

- The file itself, deliberately (see Behavior changes). Its consumers pass div props (`role`, `aria-modal`, `aria-labelledby`, `data-testid`, `onClick`) to `<Dialog>` and manage open state themselves (`if (!open) return null`), so turning it into a Base UI `Dialog.Root` would require consumer edits — forbidden by the brief — and would break the existing `src/__tests__/accessibility/dialog-sheet.test.tsx`, which renders `<Dialog>` with no `open` prop and expects the content inside the render container (a portal would move it out).
- Consumers `packages/extensions/src/components/InstallProviderDialog.tsx`, `packages/storage/src/components/StoragePage.tsx`, `packages/backup/src/components/BackupPage.tsx`, `packages/migration/src/components/MigrationPage.tsx`: untouched.

## Behavior changes

- None: nothing was changed. For the record, this wrapper has no focus trap, no Escape handling and no portal today; those exist only in a real dialog primitive. Giving it one means the public API grows `open`/`onOpenChange` (consumers currently own that state), i.e. a consumer-facing change and a follow-up slice, not part of this migration.

## Verify by hand

- Storage page: press "Clear" → the confirm overlay appears with its `role="dialog"`/`aria-modal`; Cancel and the backdrop click both dismiss it.
- Extensions page: open the install-provider dialog, click the backdrop → it closes; clicks inside the card do not close it.
- No React "unknown prop" warnings in the console for the untouched div props.
