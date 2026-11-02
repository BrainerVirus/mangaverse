import type { ThemeDefinition } from '@app/shared';

/** Shared contract for the Guided and Advanced editor panels. */
export interface ThemeEditorPanelProps {
  readonly draft: ThemeDefinition;
  readonly onChange: (next: ThemeDefinition) => void;
  readonly disabled?: boolean;
}
