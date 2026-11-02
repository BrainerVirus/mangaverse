import { useMemo, useState } from 'react';
import {
  Alert,
  AlertTitle,
  buttonVariants,
  Button,
  Input,
  Label,
  SettingsSection,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@app/design-system';
import type { ThemeOverrideToken } from '@app/shared';
import { linter, type Diagnostic } from '@codemirror/lint';
import { json } from '@codemirror/lang-json';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';

import { isCssColor } from '../color.js';
import { buildThemeCssVariablesForDefinition } from '../derive.js';
import type { ThemeAppearance, ThemeCssVariables } from '../tokens.js';
import {
  exportThemeCss,
  exportThemeJson,
  FIXED_THEME_TOKENS,
  findOutOfGamutThemeColors,
  importThemeJson,
  setThemeOverride,
  THEME_TOKEN_GROUPS,
  toHexColor,
  validateThemeJsonText,
  type ThemeJsonDiagnostic,
} from './theme-advanced.js';
import type { ThemeEditorPanelProps } from './theme-editor-panel.js';

const COLOR_HINT =
  'Must be a CSS Color 4 value: hex, rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch() or color(display-p3 …).';

const JSON_EXTENSIONS = [
  json(),
  linter(
    (view: EditorView): Diagnostic[] =>
      validateThemeJsonText(view.state.doc.toString()).diagnostics.map((diagnostic) => ({
        from: diagnostic.from,
        to: diagnostic.to,
        severity: 'error' as const,
        source: 'theme-json',
        message: diagnostic.message,
      })),
    { delay: 250 },
  ),
  EditorView.contentAttributes.of({ 'aria-label': 'Theme definition JSON' }),
];

function downloadHref(mime: string, content: string): string {
  return `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
}

function GamutNotice({
  path,
  value,
  srgbFallback,
}: {
  readonly path: string;
  readonly value: string;
  readonly srgbFallback: string;
}) {
  const srgbHex = toHexColor(srgbFallback);
  const p3Hex = toHexColor(value);
  return (
    <div className="space-y-1 rounded-control border border-warning bg-warning/10 p-2">
      <p className="type-micro text-foreground">
        {path} is outside sRGB. The draft keeps the authored Display P3 value and still saves.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1 type-micro text-muted-foreground">
          <input
            type="color"
            readOnly
            value={srgbHex ?? '#000000'}
            aria-label={`sRGB fallback preview for ${path}`}
          />
          sRGB fallback {srgbFallback}
        </span>
        <span className="flex items-center gap-1 type-micro text-muted-foreground">
          <input
            type="color"
            readOnly
            value={p3Hex ?? '#000000'}
            aria-label={`Display P3 preview for ${path}`}
          />
          Display P3 {value}
        </span>
      </div>
    </div>
  );
}

function TokenRow({
  definition,
  appearance,
  token,
  derived,
  disabled,
  onChange,
}: {
  readonly definition: ThemeEditorPanelProps['draft'];
  readonly appearance: ThemeAppearance;
  readonly token: ThemeOverrideToken;
  readonly derived: string;
  readonly disabled: boolean;
  readonly onChange: ThemeEditorPanelProps['onChange'];
}) {
  const id = `theme-override-${appearance}-${token}`;
  const override = definition[appearance].overrides?.[token];
  const value = override ?? '';
  const invalid = value.trim() !== '' && !isCssColor(value);

  return (
    <div className="space-y-2 rounded-control border border-border p-3" data-token={token}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{token}</Label>
        <span className="type-micro text-muted-foreground">
          {override === undefined ? 'Derived' : 'Override'}
        </span>
      </div>
      <Input
        id={id}
        value={value}
        placeholder={derived}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={`${id}-help`}
        onChange={(event) =>
          onChange(setThemeOverride(definition, appearance, token, event.target.value))
        }
      />
      <p id={`${id}-help`} className="type-micro text-muted-foreground">
        Derived: {derived}
      </p>
      {invalid ? (
        <p role="alert" className="type-micro text-destructive">
          {COLOR_HINT}
        </p>
      ) : null}
      {override === undefined ? null : (
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={`Reset ${token} to the derived color`}
          onClick={() => onChange(setThemeOverride(definition, appearance, token, undefined))}
        >
          Reset to derived
        </Button>
      )}
    </div>
  );
}

function TokenEditor({ draft, disabled = false, onChange }: ThemeEditorPanelProps) {
  // One derivation per appearance, not one per token row: every row reads this map.
  const variables = useMemo<Record<ThemeAppearance, ThemeCssVariables>>(
    () => ({
      light: buildThemeCssVariablesForDefinition(draft, 'light'),
      dark: buildThemeCssVariablesForDefinition(draft, 'dark'),
    }),
    [draft],
  );

  return (
    <Tabs defaultValue="light" className="space-y-4">
      <TabsList aria-label="Theme appearance">
        <TabsTrigger value="light">Light</TabsTrigger>
        <TabsTrigger value="dark">Dark</TabsTrigger>
      </TabsList>
      {(['light', 'dark'] as const).map((appearance) => (
        <TabsContent key={appearance} value={appearance} className="space-y-4">
          {THEME_TOKEN_GROUPS.map((group) => (
            <SettingsSection
              key={group.label}
              title={group.label}
              description="Override an allow-listed color token; blank restores the derived color."
            >
              <div className="space-y-3">
                {group.tokens.map((token) => (
                  <TokenRow
                    key={token}
                    definition={draft}
                    appearance={appearance}
                    token={token}
                    derived={variables[appearance][token]}
                    disabled={disabled}
                    onChange={onChange}
                  />
                ))}
              </div>
            </SettingsSection>
          ))}
        </TabsContent>
      ))}
      <SettingsSection
        title="Fixed by the design system"
        description="Glass tiers, sheen, inner shadow and radius are not themeable; overrides cannot set them."
      >
        <ul data-testid="theme-fixed-tokens" className="space-y-2">
          {FIXED_THEME_TOKENS.map((token) => (
            <li
              key={token}
              className="flex items-center justify-between rounded-control border border-border px-3 py-2"
            >
              <span className="type-label text-foreground">{token}</span>
              <span className="type-micro text-muted-foreground">Read-only</span>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </Tabs>
  );
}

function DiagnosticList({ diagnostics }: { readonly diagnostics: readonly ThemeJsonDiagnostic[] }) {
  if (diagnostics.length === 0) {
    return (
      <output className="block type-micro text-muted-foreground">
        Valid theme JSON. Nothing changes until you apply it.
      </output>
    );
  }

  return (
    <Alert variant="destructive" aria-live="polite">
      <AlertTitle>Fix the theme JSON</AlertTitle>
      <ul data-testid="theme-json-diagnostics" className="type-body list-disc space-y-1 pl-4">
        {diagnostics.map((diagnostic) => (
          <li key={`${diagnostic.path}:${diagnostic.message}`}>
            Line {diagnostic.line}, column {diagnostic.column}: {diagnostic.message}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

function JsonEditor({ draft, disabled = false, onChange }: ThemeEditorPanelProps) {
  const [text, setText] = useState(() => exportThemeJson(draft));
  const validation = useMemo(() => validateThemeJsonText(text), [text]);
  const diagnostics = validation.ok ? [] : validation.diagnostics;
  const jsonExport = useMemo(() => exportThemeJson(draft), [draft]);
  const cssExport = useMemo(() => {
    try {
      return { css: exportThemeCss(draft), error: null };
    } catch (cause) {
      return {
        css: null,
        error:
          cause instanceof Error
            ? cause.message
            : 'The draft is not a valid theme, so it cannot be exported.',
      };
    }
  }, [draft]);
  const fileBase = draft.id.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'theme';

  return (
    <div className="space-y-3">
      <p className="type-body text-muted-foreground">
        Edit the stored definition directly. Syntax errors and schema issues are marked at the exact
        token; import accepts JSON only, and CSS is export-only.
      </p>
      <div className="overflow-hidden rounded-control border border-border">
        <CodeMirror
          value={text}
          height="320px"
          extensions={JSON_EXTENSIONS}
          editable={!disabled}
          readOnly={disabled}
          basicSetup={{ foldGutter: false, highlightActiveLine: false }}
          onChange={(next) => setText(next)}
        />
      </div>
      <DiagnosticList diagnostics={diagnostics} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={disabled || !validation.ok}
          onClick={() => {
            if (validation.ok) {
              // The id is the edited theme's identity, never imported content.
              onChange({ ...validation.value, id: draft.id });
            }
          }}
        >
          Apply JSON
        </Button>
        <a
          href={downloadHref('application/json', jsonExport)}
          download={`${fileBase}.json`}
          className={buttonVariants.outline}
        >
          Export JSON
        </a>
        {cssExport.css === null ? (
          <p role="note" className="type-micro text-destructive">
            {cssExport.error}
          </p>
        ) : (
          <a
            href={downloadHref('text/css', cssExport.css)}
            download={`${fileBase}.css`}
            className={buttonVariants.outline}
          >
            Export CSS
          </a>
        )}
        <Label htmlFor="theme-json-import" className="type-micro text-muted-foreground">
          Import JSON
        </Label>
        <Input
          id="theme-json-import"
          type="file"
          accept="application/json,.json"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file === undefined) {
              return;
            }
            void file.text().then((next) => {
              setText(next);
              const result = importThemeJson(next);
              if (result.ok) {
                // Keep the theme being edited: an imported id must not retarget Save.
                onChange({ ...result.value, id: draft.id });
              }
            });
          }}
        />
      </div>
    </div>
  );
}

/**
 * Advanced panel for the theme editor: allow-listed token overrides grouped by role,
 * read-only glass/radius tokens, and a CodeMirror JSON view with schema diagnostics,
 * JSON import/export and resolved CSS export.
 */
export function ThemeAdvancedEditor({ draft, onChange, disabled = false }: ThemeEditorPanelProps) {
  const gamutEntries = findOutOfGamutThemeColors(draft);

  return (
    <div data-testid="theme-advanced-editor" className="space-y-4">
      <p className="type-body text-muted-foreground">
        Every value accepts any CSS Color 4 syntax. Nothing in this draft is applied until you save.
      </p>

      {gamutEntries.length === 0 ? null : (
        <Alert data-testid="theme-gamut-alert">
          <AlertTitle>Outside sRGB</AlertTitle>
          <div className="space-y-2">
            <p className="type-body text-muted-foreground">
              These authored colors fall outside sRGB. The sRGB fallback is previewed beside the
              Display P3 color; saving keeps the authored value.
            </p>
            <ul className="space-y-2">
              {gamutEntries.map((entry) => (
                <li key={entry.path}>
                  <GamutNotice
                    path={entry.path}
                    value={entry.value}
                    srgbFallback={entry.srgbFallback}
                  />
                </li>
              ))}
            </ul>
          </div>
        </Alert>
      )}

      <Tabs defaultValue="tokens" className="space-y-4">
        <TabsList aria-label="Advanced editing mode">
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>
        <TabsContent value="tokens">
          <TokenEditor draft={draft} disabled={disabled} onChange={onChange} />
        </TabsContent>
        <TabsContent value="json">
          <JsonEditor
            key={exportThemeJson(draft)}
            draft={draft}
            disabled={disabled}
            onChange={onChange}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
