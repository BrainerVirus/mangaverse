import type { ThemeDefinition, ThemeDefinitionIssue, ThemeOverrides } from '@app/shared';
import {
  isCustomThemeId,
  THEME_OVERRIDE_TOKENS,
  THEME_SEED_TOKEN_NAMES,
  type ThemeOverrideToken,
} from '@app/shared';
import { jsonLanguage } from '@codemirror/lang-json';

import { isBuiltInThemeId } from '../built-in-themes.js';
import { isCssColor, isInSrgbGamut, mapToSrgbGamut, parseCssColor } from '../color.js';
import { buildThemeCssVariablesForDefinition } from '../derive.js';
import { validateThemeDefinition } from '../theme-definition.js';
import type { ThemeAppearance, ThemeCssVariables } from '../tokens.js';

type ThemeTokenGroupLabel = 'Surfaces' | 'Text' | 'Borders' | 'Status' | 'Reader';

export interface ThemeTokenGroup {
  readonly label: ThemeTokenGroupLabel;
  readonly tokens: readonly ThemeOverrideToken[];
}

/** The allow-list, grouped for the advanced token panel. Every token appears once. */
export const THEME_TOKEN_GROUPS: readonly ThemeTokenGroup[] = [
  {
    label: 'Surfaces',
    tokens: [
      '--background',
      '--card',
      '--popover',
      '--muted',
      '--secondary',
      '--accent',
      '--primary',
      '--sidebar',
      '--sidebar-accent',
    ],
  },
  {
    label: 'Text',
    tokens: [
      '--foreground',
      '--card-foreground',
      '--popover-foreground',
      '--muted-foreground',
      '--primary-foreground',
      '--secondary-foreground',
      '--accent-foreground',
      '--destructive-foreground',
      '--sidebar-foreground',
      '--sidebar-accent-foreground',
    ],
  },
  { label: 'Borders', tokens: ['--border', '--input', '--ring', '--sidebar-border'] },
  {
    label: 'Status',
    tokens: [
      '--destructive',
      '--destructive-glass',
      '--success',
      '--success-glass',
      '--warning',
      '--warning-glass',
    ],
  },
  { label: 'Reader', tokens: ['--reader-background'] },
];

/** Non-color tokens the panel shows but cannot edit (design-system owned). */
export const FIXED_THEME_TOKENS = [
  '--glass-thin',
  '--glass-regular',
  '--glass-thick',
  '--glass-stage',
  '--glass-sheen',
  '--glass-inner',
  '--radius-box',
  '--radius-control',
  '--radius-btn',
  '--radius-badge',
  '--radius-glass',
] as const;

const THEME_OVERRIDE_TOKEN_SET: ReadonlySet<string> = new Set(THEME_OVERRIDE_TOKENS);

function isThemeOverrideToken(value: string): value is ThemeOverrideToken {
  return THEME_OVERRIDE_TOKEN_SET.has(value);
}

/**
 * Writes one override (or removes it when the value is blank) without mutating the
 * draft. Unknown keys are programmer errors: the UI only renders the allow-list.
 */
export function setThemeOverride(
  definition: ThemeDefinition,
  appearance: ThemeAppearance,
  token: string,
  value: string | undefined,
): ThemeDefinition {
  if (!isThemeOverrideToken(token)) {
    throw new Error(
      `Unknown theme override token "${token}". Accepted: ${THEME_OVERRIDE_TOKENS.join(', ')}.`,
    );
  }

  const current = definition[appearance];
  const overrides: Record<string, string> = { ...current.overrides };
  if (value === undefined || value.trim() === '') {
    delete overrides[token];
  } else {
    overrides[token] = value;
  }

  const next =
    Object.keys(overrides).length === 0
      ? { seeds: current.seeds }
      : { seeds: current.seeds, overrides: overrides as ThemeOverrides };

  return appearance === 'light' ? { ...definition, light: next } : { ...definition, dark: next };
}

/** The effective value of a token: its override when present, otherwise the derivation. */
export function getThemeTokenValue(
  definition: ThemeDefinition,
  appearance: ThemeAppearance,
  token: ThemeOverrideToken,
): string {
  return buildThemeCssVariablesForDefinition(definition, appearance)[token];
}

export interface ThemeGamutEntry {
  readonly path: string;
  readonly value: string;
  readonly srgbFallback: string;
}

/** Every authored color outside sRGB, with the sRGB fallback the preview paints. */
export function findOutOfGamutThemeColors(definition: ThemeDefinition): readonly ThemeGamutEntry[] {
  const entries: ThemeGamutEntry[] = [];
  const record = (path: string, value: string): void => {
    if (!isCssColor(value) || isInSrgbGamut(value)) {
      return;
    }
    const srgbFallback = mapToSrgbGamut(value);
    if (srgbFallback !== undefined) {
      entries.push({ path, value, srgbFallback });
    }
  };

  for (const appearance of ['light', 'dark'] as const) {
    for (const seed of THEME_SEED_TOKEN_NAMES) {
      record(`${appearance}.seeds.${seed}`, definition[appearance].seeds[seed]);
    }
    for (const [token, value] of Object.entries(definition[appearance].overrides ?? {})) {
      record(`${appearance}.overrides.${token}`, value);
    }
  }

  return entries;
}

/** `#rrggbb` for a native color input, or `undefined` when the value is unparseable. */
export function toHexColor(value: string): string | undefined {
  const rgb = parseCssColor(value);
  if (rgb === undefined) {
    return undefined;
  }
  return `#${rgb
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export interface ThemeJsonDiagnostic {
  readonly from: number;
  readonly to: number;
  /** 1-based line in the JSON text. */
  readonly line: number;
  /** 1-based column in the JSON text. */
  readonly column: number;
  readonly path: string;
  readonly message: string;
}

export type ThemeJsonValidation =
  | { readonly ok: true; readonly value: ThemeDefinition; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: readonly ThemeJsonDiagnostic[] };

interface JsonSpan {
  readonly keyFrom: number;
  readonly keyTo: number;
  readonly valueFrom: number;
  readonly valueTo: number;
}

interface JsonNode {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly firstChild: JsonNode | null;
  readonly nextSibling: JsonNode | null;
}

function lineColumnAt(
  text: string,
  offset: number,
): { readonly line: number; readonly column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < clamped; index += 1) {
    if (text[index] === '\n') {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, column: clamped - lineStart + 1 };
}

function collectJsonSpans(text: string): ReadonlyMap<string, JsonSpan> {
  const spans = new Map<string, JsonSpan>();
  const root = jsonLanguage.parser.parse(text).topNode.firstChild as JsonNode | null;
  if (root === null) {
    return spans;
  }

  const walk = (node: JsonNode, path: string): void => {
    if (node.name === 'Object') {
      for (let property = node.firstChild; property !== null; property = property.nextSibling) {
        if (property.name !== 'Property') {
          continue;
        }
        const keyNode = property.firstChild;
        const valueNode = keyNode?.nextSibling?.nextSibling ?? null;
        if (keyNode === null || valueNode === null) {
          continue;
        }
        const key: unknown = JSON.parse(text.slice(keyNode.from, keyNode.to));
        if (typeof key !== 'string') {
          continue;
        }
        const childPath = path === '' ? key : `${path}.${key}`;
        spans.set(childPath, {
          keyFrom: keyNode.from,
          keyTo: keyNode.to,
          valueFrom: valueNode.from,
          valueTo: valueNode.to,
        });
        walk(valueNode, childPath);
      }
    } else if (node.name === 'Array') {
      let index = 0;
      for (let item = node.firstChild; item !== null; item = item.nextSibling) {
        if (item.name === '[' || item.name === ',' || item.name === ']') {
          continue;
        }
        walk(item, `${path}.${index}`);
        index += 1;
      }
    }
  };

  walk(root, '');
  return spans;
}

function nearestSpan(
  spans: ReadonlyMap<string, JsonSpan>,
  path: string,
): { readonly key: { from: number; to: number }; readonly value: { from: number; to: number } } {
  let candidate = path;
  while (candidate !== '') {
    const span = spans.get(candidate);
    if (span !== undefined) {
      return {
        key: { from: span.keyFrom, to: span.keyTo },
        value: { from: span.valueFrom, to: span.valueTo },
      };
    }
    const dot = candidate.lastIndexOf('.');
    candidate = dot === -1 ? '' : candidate.slice(0, dot);
  }
  const root = spans.get('');
  return root === undefined
    ? { key: { from: 0, to: 0 }, value: { from: 0, to: 0 } }
    : {
        key: { from: root.keyFrom, to: root.keyTo },
        value: { from: root.valueFrom, to: root.valueTo },
      };
}

function jsonSyntaxDiagnostic(text: string): ThemeJsonDiagnostic | undefined {
  let error: { readonly from: number; readonly to: number } | undefined;
  jsonLanguage.parser.parse(text).iterate({
    enter(node) {
      if (node.type.isError) {
        error = { from: node.from, to: node.to };
        return false;
      }
      return undefined;
    },
  });

  if (error === undefined) {
    try {
      JSON.parse(text);
      return undefined;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Invalid JSON.';
      const match = /at position (\d+)/.exec(message);
      const from = match === null ? 0 : Math.min(Number(match[1]), text.length);
      error = { from, to: from };
    }
  }

  const { line, column } = lineColumnAt(text, error.from);
  const to = Math.min(Math.max(error.to, error.from + 1), text.length);
  return {
    from: error.from,
    to,
    line,
    column,
    path: '',
    message: `JSON syntax error at line ${line}, column ${column}: unexpected or missing token. Accepted: a JSON object with schemaVersion 1, a custom:<id> id, a name, and light/dark appearances.`,
  };
}

const THEME_DEFINITION_KEYS: ReadonlySet<string> = new Set([
  'schemaVersion',
  'id',
  'name',
  'basedOn',
  'light',
  'dark',
]);
const APPEARANCE_KEYS: ReadonlySet<string> = new Set(['seeds', 'overrides']);
const SEED_KEYS: ReadonlySet<string> = new Set(THEME_SEED_TOKEN_NAMES);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Zod object schemas strip unknown keys, so the import guard rejects them explicitly:
 * silently dropping user data is worse than naming the exact path.
 */
function collectUnknownKeyIssues(input: unknown): ThemeDefinitionIssue[] {
  if (!isPlainRecord(input)) {
    return [];
  }

  const issues: ThemeDefinitionIssue[] = [];
  const report = (path: string, key: string): void => {
    issues.push({ path, message: `Unrecognized key: ${key}` });
  };

  for (const key of Object.keys(input)) {
    if (!THEME_DEFINITION_KEYS.has(key)) {
      report(key, key);
    }
  }

  for (const appearance of ['light', 'dark'] as const) {
    const value = input[appearance];
    if (!isPlainRecord(value)) {
      continue;
    }
    for (const key of Object.keys(value)) {
      if (!APPEARANCE_KEYS.has(key)) {
        report(`${appearance}.${key}`, key);
      }
    }
    const seeds = value['seeds'];
    if (isPlainRecord(seeds)) {
      for (const key of Object.keys(seeds)) {
        if (!SEED_KEYS.has(key)) {
          report(`${appearance}.seeds.${key}`, key);
        }
      }
    }
  }

  return issues;
}

function collectIdIssues(input: unknown): ThemeDefinitionIssue[] {
  if (!isPlainRecord(input)) {
    return [];
  }
  const id = input['id'];
  if (typeof id !== 'string' || id.length === 0) {
    return [];
  }
  if (isBuiltInThemeId(id)) {
    return [
      {
        path: 'id',
        message: `Built-in theme id "${id}" cannot be imported; use a custom:<id> id.`,
      },
    ];
  }
  if (!isCustomThemeId(id)) {
    return [{ path: 'id', message: 'Imported themes must use a custom:<id> id.' }];
  }
  return [];
}

const COLOR_HINT =
  'Accepted: any CSS Color 4 value such as #1a1a1a, rgb(0 0 0), hsl(0 0% 0%), oklch(0.5 0.1 200) or color(display-p3 1 0 0).';

function acceptedHint(issue: ThemeDefinitionIssue): string {
  if (issue.message.startsWith('Unrecognized key')) {
    if (issue.path.includes('.overrides.')) {
      return 'Accepted: an allow-listed color token such as --ring or --success-glass; glass tier, sheen, inner shadow and radius tokens are read-only.';
    }
    if (issue.path.includes('.seeds.')) {
      return `Accepted: the ten seed names (${THEME_SEED_TOKEN_NAMES.join(', ')}).`;
    }
    if (
      issue.path === 'light' ||
      issue.path === 'dark' ||
      issue.path.startsWith('light.') ||
      issue.path.startsWith('dark.')
    ) {
      return 'Accepted keys: seeds, overrides.';
    }
    return 'Accepted keys: schemaVersion, id, name, basedOn, light, dark.';
  }
  if (issue.path === 'schemaVersion') {
    return 'Accepted: 1.';
  }
  if (issue.path === 'id') {
    return 'Accepted: a custom:<id> string; built-in theme ids are rejected.';
  }
  if (
    issue.path.endsWith('.seeds') ||
    issue.path.endsWith('.overrides') ||
    issue.path === 'light' ||
    issue.path === 'dark'
  ) {
    return 'Accepted: an object of color values.';
  }
  if (
    issue.message.includes('CSS Color 4') ||
    issue.path.includes('.seeds.') ||
    issue.path.includes('.overrides.')
  ) {
    return COLOR_HINT;
  }
  if (issue.path === 'name') {
    return 'Accepted: a non-empty theme name.';
  }
  return '';
}

function formatIssue(issue: ThemeDefinitionIssue): string {
  const location = issue.path === '' ? '' : `${issue.path}: `;
  const statement = /[.!?]$/.test(issue.message) ? issue.message : `${issue.message}.`;
  const hint = acceptedHint(issue);
  return `${location}${statement}${hint === '' ? '' : ` ${hint}`}`;
}

/**
 * Validates theme JSON for the editor: syntax first (line/column), then unknown keys,
 * import-only id rules and the shared schema. Diagnostics carry both text offsets for
 * CodeMirror and 1-based line/column for the message list.
 */
export function validateThemeJsonText(text: string): ThemeJsonValidation {
  const syntax = jsonSyntaxDiagnostic(text);
  if (syntax !== undefined) {
    return { ok: false, diagnostics: [syntax] };
  }

  const parsed: unknown = (() => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  })();
  if (parsed === undefined) {
    const { line, column } = lineColumnAt(text, 0);
    return {
      ok: false,
      diagnostics: [
        {
          from: 0,
          to: Math.min(1, text.length),
          line,
          column,
          path: '',
          message: `JSON syntax error at line ${line}, column ${column}: unexpected or missing token. Accepted: a JSON object with schemaVersion 1, a custom:<id> id, a name, and light/dark appearances.`,
        },
      ],
    };
  }
  const schema = validateThemeDefinition(parsed);
  const issues = new Map<string, ThemeDefinitionIssue>();
  for (const issue of [
    ...collectUnknownKeyIssues(parsed),
    ...collectIdIssues(parsed),
    ...(schema.ok ? [] : schema.issues),
  ]) {
    issues.set(`${issue.path}\u0000${issue.message}`, issue);
  }

  if (schema.ok && issues.size === 0) {
    return { ok: true, value: schema.value, diagnostics: [] };
  }

  const spans = collectJsonSpans(text);
  const diagnostics = [...issues.values()].map((issue): ThemeJsonDiagnostic => {
    const span = nearestSpan(spans, issue.path);
    const useKey = issue.message.startsWith('Unrecognized key');
    const from = useKey ? span.key.from : span.value.from;
    const to = useKey ? span.key.to : span.value.to;
    const { line, column } = lineColumnAt(text, from);
    return { from, to, line, column, path: issue.path, message: formatIssue(issue) };
  });

  return { ok: false, diagnostics };
}

/** Import entry point: the same validation the editor uses before applying text. */
export function importThemeJson(text: string): ThemeJsonValidation {
  return validateThemeJsonText(text);
}

export function exportThemeJson(definition: ThemeDefinition): string {
  return `${JSON.stringify(definition, null, 2)}\n`;
}

/**
 * Resolved color variables only: light on `:root`, dark under `.dark`, the exact
 * selectors the app's variable writer uses. No raw CSS is imported anywhere.
 */
export function exportThemeCss(definition: ThemeDefinition): string {
  const validation = validateThemeDefinition(definition);
  if (!validation.ok) {
    throw new Error(`Cannot export an invalid theme: ${validation.error.message}`);
  }

  const block = (selector: string, variables: ThemeCssVariables): readonly string[] => [
    `${selector} {`,
    ...THEME_OVERRIDE_TOKENS.map((token) => `  ${token}: ${variables[token]};`),
    '}',
  ];

  return [
    ...block(':root', buildThemeCssVariablesForDefinition(definition, 'light')),
    '',
    ...block('.dark', buildThemeCssVariablesForDefinition(definition, 'dark')),
    '',
  ].join('\n');
}
