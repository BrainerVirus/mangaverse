import { useState, type CSSProperties } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Label,
  SettingsSection,
} from '@app/design-system';
import type { ThemeDefinition, ThemeDefinitionIssue } from '@app/shared';

import { buildThemeCssVariables } from '../apply-theme.js';
import { ConfirmDeleteThemeDialog } from './ConfirmDeleteThemeDialog.js';

type ThemeVariableStyle = CSSProperties & Record<`--${string}`, string>;

const NO_ISSUES: readonly ThemeDefinitionIssue[] = [];

export interface ThemeEditorPageProps {
  readonly draft: ThemeDefinition;
  /** The draft exists in the themes table; a fresh draft can only be saved. */
  readonly isSaved: boolean;
  readonly isSaving?: boolean;
  readonly isDeleting?: boolean;
  readonly issues?: readonly ThemeDefinitionIssue[];
  readonly errorMessage?: string | null;
  onChange: (next: ThemeDefinition) => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCancel: () => void;
}

function ThemePreviewPane({ definition, dark }: { definition: ThemeDefinition; dark: boolean }) {
  const label = dark ? 'Dark preview' : 'Light preview';
  // Scoped paint only: the same variable writer `applyThemeToRoot` uses, rendered on
  // this wrapper so nothing reaches the document root before Save.
  const variables = buildThemeCssVariables({ themeId: definition.id, dark }, definition);
  const scope: ThemeVariableStyle = {
    '--background': variables['--background'],
    '--foreground': variables['--foreground'],
    '--muted': variables['--muted'],
    '--muted-foreground': variables['--muted-foreground'],
    '--popover': variables['--popover'],
    '--popover-foreground': variables['--popover-foreground'],
    '--card': variables['--card'],
    '--card-foreground': variables['--card-foreground'],
    '--border': variables['--border'],
    '--input': variables['--input'],
    '--primary': variables['--primary'],
    '--primary-foreground': variables['--primary-foreground'],
    '--secondary': variables['--secondary'],
    '--secondary-foreground': variables['--secondary-foreground'],
    '--accent': variables['--accent'],
    '--accent-foreground': variables['--accent-foreground'],
    '--destructive': variables['--destructive'],
    '--destructive-glass': variables['--destructive-glass'],
    '--destructive-foreground': variables['--destructive-foreground'],
    '--success': variables['--success'],
    '--success-glass': variables['--success-glass'],
    '--warning': variables['--warning'],
    '--warning-glass': variables['--warning-glass'],
    '--ring': variables['--ring'],
    '--reader-background': variables['--reader-background'],
    '--sidebar': variables['--sidebar'],
    '--sidebar-foreground': variables['--sidebar-foreground'],
    '--sidebar-border': variables['--sidebar-border'],
    '--sidebar-accent': variables['--sidebar-accent'],
    '--sidebar-accent-foreground': variables['--sidebar-accent-foreground'],
  };

  return (
    <div className="space-y-2">
      <p className="type-label text-muted-foreground">{label}</p>
      <figure
        aria-label={label}
        data-appearance={dark ? 'dark' : 'light'}
        style={scope}
        className="m-0 space-y-3 rounded-box border border-border bg-background p-4 text-foreground"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="type-label">Sample heading</span>
          <span className="rounded-full bg-primary px-3 py-1 type-label text-primary-foreground">
            Primary
          </span>
        </div>
        <p className="type-body text-muted-foreground">Muted body text on the canvas.</p>
        <div className="space-y-1 rounded-control border border-border bg-card p-3 text-card-foreground">
          <p className="type-label">Card surface</p>
          <p className="type-body text-muted-foreground">Secondary line on a card.</p>
        </div>
        <div className="rounded-control bg-reader-background p-3">
          <div className="flex gap-2">
            <span className="h-10 flex-1 rounded-control bg-card" />
            <span className="h-10 flex-1 rounded-control bg-card" />
          </div>
        </div>
        <div className="flex gap-2">
          <span className="h-2 flex-1 rounded-full bg-success" />
          <span className="h-2 flex-1 rounded-full bg-warning" />
          <span className="h-2 flex-1 rounded-full bg-destructive" />
        </div>
      </figure>
    </div>
  );
}

export function ThemeEditorPage({
  draft,
  isSaved,
  isSaving = false,
  isDeleting = false,
  issues = NO_ISSUES,
  errorMessage = null,
  onChange,
  onSave,
  onDelete,
  onDuplicate,
  onCancel,
}: ThemeEditorPageProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const busy = isSaving || isDeleting;

  return (
    <section aria-label="Theme editor" className="mx-auto w-full max-w-5xl space-y-8 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="type-display-lg text-foreground">Theme editor</h1>
          <p className="type-body max-w-2xl text-muted-foreground">
            Name the theme and preview both appearances. Nothing reaches the app shell until you
            save.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="outline" onClick={onDuplicate} disabled={busy}>
            Duplicate
          </Button>
          {isSaved ? (
            <Button variant="destructive" onClick={() => setConfirmingDelete(true)} disabled={busy}>
              Delete theme
            </Button>
          ) : null}
          <Button onClick={onSave} disabled={busy}>
            {isSaving ? 'Saving…' : 'Save theme'}
          </Button>
        </div>
      </header>

      {issues.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Check the theme before saving</AlertTitle>
          <div className="type-body">
            <ul className="list-disc space-y-1 pl-4">
              {issues.map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>
                  {issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`}
                </li>
              ))}
            </ul>
          </div>
        </Alert>
      ) : null}

      {errorMessage === null ? null : (
        <Alert variant="destructive">
          <AlertTitle>Could not save the theme</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <SettingsSection title="Name" description="Shown in the theme gallery and on theme cards.">
        <div className="max-w-md space-y-2">
          <Label htmlFor="theme-name">Theme name</Label>
          <Input
            id="theme-name"
            value={draft.name}
            disabled={busy}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Preview"
        description="Light and dark share the same seeds; each preview paints its own scoped variables."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <ThemePreviewPane definition={draft} dark={false} />
          <ThemePreviewPane definition={draft} dark />
        </div>
      </SettingsSection>

      {draft.basedOn === undefined ? null : (
        <p className="type-body text-muted-foreground">Based on {draft.basedOn}.</p>
      )}

      <ConfirmDeleteThemeDialog
        open={confirmingDelete}
        themeName={draft.name}
        isDeleting={isDeleting}
        onOpenChange={setConfirmingDelete}
        onConfirm={() => {
          setConfirmingDelete(false);
          onDelete();
        }}
      />
    </section>
  );
}
