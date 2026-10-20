import type { ThemeEditorPanelProps } from './theme-editor-panel.js';
/**
 * Placeholder panel for the advanced token and JSON controls. The shell, preview
 * and save path live in `ThemeEditorPage`; this file is the seam the advanced
 * slice fills in.
 */
export function ThemeAdvancedEditor(_props: ThemeEditorPanelProps) {
  return (
    <div data-testid="theme-advanced-editor" className="space-y-2">
      <p className="type-label text-foreground">Advanced</p>
      <p className="type-body text-muted-foreground">
        Token overrides and raw theme JSON will live here. Nothing in this draft is applied until
        you save.
      </p>
    </div>
  );
}
