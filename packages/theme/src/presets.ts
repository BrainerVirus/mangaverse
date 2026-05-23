export const THEME_PRESET_IDS = [
  'default',
  'minimal-light',
  'minimal-dark',
  'vercel-monochrome',
  'sakura',
  'cyberpunk',
  'amoled-black',
  'warm-paper',
  'high-contrast',
  'system',
] as const;

export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];

export interface ThemeColorTokens {
  readonly background: string;
  readonly foreground: string;
  readonly surface: string;
  readonly accent: string;
  readonly border: string;
  readonly readerBackground: string;
  readonly primary: string;
  readonly destructive: string;
  readonly success: string;
  readonly warning: string;
}

export interface ThemePresetDefinition {
  readonly id: ThemePresetId;
  readonly name: string;
  readonly description: string;
  readonly light: ThemeColorTokens;
  readonly dark: ThemeColorTokens;
}

const MINIMAL_LIGHT: ThemeColorTokens = {
  background: '#fafafa',
  foreground: '#1a1a1a',
  surface: '#ffffff',
  accent: '#f4f4f5',
  border: '#e4e4e7',
  readerBackground: '#fafafa',
  primary: '#18181b',
  destructive: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
};

const MINIMAL_DARK: ThemeColorTokens = {
  background: '#09090b',
  foreground: '#fafafa',
  surface: '#18181b',
  accent: '#27272a',
  border: '#27272a',
  readerBackground: '#09090b',
  primary: '#fafafa',
  destructive: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
};

export const THEME_PRESETS: readonly ThemePresetDefinition[] = [
  {
    id: 'default',
    name: 'Minimal',
    description: 'Balanced light and dark surfaces for everyday reading.',
    light: MINIMAL_LIGHT,
    dark: MINIMAL_DARK,
  },
  {
    id: 'minimal-light',
    name: 'Minimal Light',
    description: 'Quiet white and gray surfaces for daytime use.',
    light: MINIMAL_LIGHT,
    dark: MINIMAL_LIGHT,
  },
  {
    id: 'minimal-dark',
    name: 'Minimal Dark',
    description: 'Balanced dark UI for low-glare browsing.',
    light: MINIMAL_DARK,
    dark: MINIMAL_DARK,
  },
  {
    id: 'vercel-monochrome',
    name: 'Vercel Monochrome',
    description: 'Crisp black, white, and gray hierarchy.',
    light: {
      background: '#ffffff',
      foreground: '#000000',
      surface: '#fafafa',
      accent: '#ededed',
      border: '#eaeaea',
      readerBackground: '#ffffff',
      primary: '#000000',
      destructive: '#e00',
      success: '#0070f3',
      warning: '#f5a623',
    },
    dark: {
      background: '#000000',
      foreground: '#ffffff',
      surface: '#111111',
      accent: '#1a1a1a',
      border: '#333333',
      readerBackground: '#000000',
      primary: '#ffffff',
      destructive: '#ff4444',
      success: '#0070f3',
      warning: '#f5a623',
    },
  },
  {
    id: 'sakura',
    name: 'Sakura',
    description: 'Warm whites with soft pink accents.',
    light: {
      background: '#fff7f9',
      foreground: '#4a2c36',
      surface: '#fff0f4',
      accent: '#ffd6e3',
      border: '#f5ccd8',
      readerBackground: '#fff7f9',
      primary: '#d4577a',
      destructive: '#dc2626',
      success: '#16a34a',
      warning: '#d97706',
    },
    dark: {
      background: '#1a1014',
      foreground: '#fce7ef',
      surface: '#261820',
      accent: '#3d2430',
      border: '#4a2c36',
      readerBackground: '#140c10',
      primary: '#f472b6',
      destructive: '#f87171',
      success: '#4ade80',
      warning: '#fbbf24',
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Deep dark surfaces with electric accent glow.',
    light: {
      background: '#f4f0ff',
      foreground: '#1a1033',
      surface: '#ebe4ff',
      accent: '#ddd0ff',
      border: '#c4b5fd',
      readerBackground: '#f0ebff',
      primary: '#7c3aed',
      destructive: '#ef4444',
      success: '#10b981',
      warning: '#f59e0b',
    },
    dark: {
      background: '#0a0614',
      foreground: '#e9d5ff',
      surface: '#150d28',
      accent: '#1f1440',
      border: '#312060',
      readerBackground: '#050310',
      primary: '#22d3ee',
      destructive: '#fb7185',
      success: '#34d399',
      warning: '#fbbf24',
    },
  },
  {
    id: 'amoled-black',
    name: 'AMOLED Black',
    description: 'True black surfaces tuned for OLED displays.',
    light: MINIMAL_LIGHT,
    dark: {
      background: '#000000',
      foreground: '#f5f5f5',
      surface: '#0a0a0a',
      accent: '#141414',
      border: '#1f1f1f',
      readerBackground: '#000000',
      primary: '#ffffff',
      destructive: '#ef4444',
      success: '#22c55e',
      warning: '#f59e0b',
    },
  },
  {
    id: 'warm-paper',
    name: 'Warm Paper',
    description: 'Sepia paper tones with low-glare text.',
    light: {
      background: '#f5ead6',
      foreground: '#3d2f1f',
      surface: '#faf3e6',
      accent: '#ead9bc',
      border: '#dcc9a8',
      readerBackground: '#f0e4cc',
      primary: '#8b6914',
      destructive: '#b45309',
      success: '#15803d',
      warning: '#a16207',
    },
    dark: {
      background: '#1f1810',
      foreground: '#ead9bc',
      surface: '#2a2118',
      accent: '#3d3020',
      border: '#4a3a28',
      readerBackground: '#18120c',
      primary: '#d4a853',
      destructive: '#f87171',
      success: '#4ade80',
      warning: '#fbbf24',
    },
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    description: 'Strict contrast and strong focus states.',
    light: {
      background: '#ffffff',
      foreground: '#000000',
      surface: '#ffffff',
      accent: '#e5e5e5',
      border: '#000000',
      readerBackground: '#ffffff',
      primary: '#0000ee',
      destructive: '#cc0000',
      success: '#006600',
      warning: '#996600',
    },
    dark: {
      background: '#000000',
      foreground: '#ffffff',
      surface: '#000000',
      accent: '#1a1a1a',
      border: '#ffffff',
      readerBackground: '#000000',
      primary: '#66b3ff',
      destructive: '#ff6666',
      success: '#66ff66',
      warning: '#ffcc66',
    },
  },
  {
    id: 'system',
    name: 'System',
    description: 'Follows your device light or dark preference.',
    light: MINIMAL_LIGHT,
    dark: MINIMAL_DARK,
  },
] as const;

const PRESET_BY_ID = new Map(THEME_PRESETS.map((preset) => [preset.id, preset]));

export function getThemePreset(presetId: string): ThemePresetDefinition {
  return PRESET_BY_ID.get(presetId as ThemePresetId) ?? PRESET_BY_ID.get('default')!;
}

export function isThemePresetId(value: string): value is ThemePresetId {
  return PRESET_BY_ID.has(value as ThemePresetId);
}
