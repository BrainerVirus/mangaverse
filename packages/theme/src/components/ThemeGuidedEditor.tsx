/**
 * Placeholder panel for the guided colour controls. The shell, preview and save
 * path live in `ThemeEditorPage`; this file is the seam the guided slice fills in.
 */
export function ThemeGuidedEditor() {
  return (
    <div data-testid="theme-guided-editor" className="space-y-2">
      <p className="type-label text-foreground">Guided</p>
      <p className="type-body text-muted-foreground">
        Pick seeds and see derivations when guided controls land. The preview above already reflects
        your draft.
      </p>
    </div>
  );
}
