import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  applyThemeToRoot,
  getDefaultThemeSettings,
  isCustomThemeId,
  resolveThemeAppearance,
  validateThemeSettings,
} from '@/features/theme';
import type { ThemeDefinition, ThemeSettings } from '@app/shared';

type Theme = 'light' | 'dark';
type ThemeSettingsPersistence = (settings: ThemeSettings) => void;

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  settings: ThemeSettings;
  setThemeSettings: (settings: ThemeSettings) => void;
  hydrateThemeSettings: (settings: ThemeSettings) => void;
  registerThemeSettingsPersistence: (persist: ThemeSettingsPersistence | null) => void;
  isSaving: boolean;
  setThemeSaving: (isSaving: boolean) => void;
  /** Custom definitions loaded from the themes table; undefined until the first load settles. */
  hydrateThemeDefinitions: (definitions: readonly ThemeDefinition[] | null | undefined) => void;
  customThemes: readonly ThemeDefinition[];
  isLoadingCustomThemes: boolean;
  /** The definition applied for the selected themeId; built-ins resolve from code. */
  themeDefinition: ThemeDefinition | undefined;
  /** True when the definitions query failed, so custom themes cannot be listed. */
  isCustomThemesError: boolean;
  /** Visible fallback message when the selected custom theme cannot be applied. */
  themeNotice: string | null;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

const THEME_ID_KEY = 'themeId';
const THEME_DARK_KEY = 'dark';
const THEME_APPEARANCE_KEY = 'theme';
// Pre-#131 keys; read once so existing installs keep their choice.
const LEGACY_THEME_ID_KEY = 'theme-preset-id';
const LEGACY_THEME_DARK_KEY = 'theme-dark';

function parseStoredSettings(themeId: string | null, dark: string | null): ThemeSettings | null {
  if (themeId === null || (dark !== 'true' && dark !== 'false')) {
    return null;
  }
  const result = validateThemeSettings({ themeId, dark: dark === 'true' });
  return result.ok ? result.value : null;
}

function readStoredThemeSettings(): ThemeSettings | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = parseStoredSettings(
      localStorage.getItem(THEME_ID_KEY),
      localStorage.getItem(THEME_DARK_KEY),
    );
    if (stored !== null) {
      return stored;
    }

    const migrated = parseStoredSettings(
      localStorage.getItem(LEGACY_THEME_ID_KEY),
      localStorage.getItem(LEGACY_THEME_DARK_KEY),
    );
    if (migrated === null) {
      return null;
    }
    persistThemeLocally(migrated);
    return migrated;
  } catch {
    // Ignore storage failures in private browsing.
  }

  return null;
}

function persistThemeLocally(settings: ThemeSettings): void {
  try {
    localStorage.setItem(THEME_ID_KEY, settings.themeId);
    localStorage.setItem(THEME_DARK_KEY, String(settings.dark));
    localStorage.setItem(THEME_APPEARANCE_KEY, resolveThemeAppearance(settings));
    localStorage.removeItem(LEGACY_THEME_ID_KEY);
    localStorage.removeItem(LEGACY_THEME_DARK_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(getDefaultThemeSettings);
  const [isSaving, setThemeSaving] = useState(false);
  const [definitions, setDefinitions] = useState<readonly ThemeDefinition[] | null | undefined>(
    undefined,
  );
  const hydratedRef = useRef(false);
  const persistRef = useRef<ThemeSettingsPersistence | null>(null);
  const appliedRef = useRef<{
    settings: ThemeSettings;
    definition: ThemeDefinition | undefined;
  } | null>(null);

  const theme = resolveThemeAppearance(settings);

  const hydrateThemeDefinitions = useCallback(
    (next: readonly ThemeDefinition[] | null | undefined) => {
      setDefinitions(next);
    },
    [],
  );

  const selectedDefinition = isCustomThemeId(settings.themeId)
    ? definitions?.find((definition) => definition.id === settings.themeId)
    : undefined;
  // `null` means the load failed; a loaded list without the id means the theme is gone.
  const definitionsUnavailable =
    isCustomThemeId(settings.themeId) &&
    definitions !== undefined &&
    selectedDefinition === undefined;

  const appliedTheme = useMemo(
    () =>
      definitionsUnavailable
        ? { settings: { ...settings, themeId: 'default' }, definition: undefined }
        : { settings, definition: selectedDefinition },
    [definitionsUnavailable, selectedDefinition, settings],
  );

  const themeNotice = definitionsUnavailable
    ? definitions === null
      ? 'Custom themes could not be loaded. Showing the default theme.'
      : 'The selected custom theme could not be found. Showing the default theme.'
    : null;

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-ssr-hydration: the stored theme is read after hydration on purpose: a useState initializer would run in the browser during the hydration render and mismatch the server's markup.
  useEffect(() => {
    const stored = readStoredThemeSettings();
    if (stored !== null && !hydratedRef.current) {
      setSettings(stored);
    }
  }, []);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-dom-write: writing the theme to <html> and localStorage is a DOM/storage side effect keyed on the resolved settings; it cannot run in render (double-invoked) and the resolved definition arrives asynchronously from the themes table.
  useEffect(() => {
    // Startup applies the default, then the stored settings, then the same
    // settings again from the themes table (a different object, equal values).
    // Skip the style writes when nothing changed; `system` still re-registers
    // its listener below.
    const previous = appliedRef.current;
    const alreadyApplied =
      previous !== null &&
      previous.definition === appliedTheme.definition &&
      previous.settings.themeId === appliedTheme.settings.themeId &&
      previous.settings.dark === appliedTheme.settings.dark;
    if (!alreadyApplied) {
      applyThemeToRoot(document.documentElement, appliedTheme.settings, appliedTheme.definition);
      appliedRef.current = appliedTheme;
    }
    persistThemeLocally(settings);

    if (settings.themeId !== 'system') {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      applyThemeToRoot(document.documentElement, appliedTheme.settings, appliedTheme.definition);
    };

    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [appliedTheme, settings]);

  const updateSettings = (nextSettings: ThemeSettings) => {
    setSettings(nextSettings);
    persistRef.current?.(nextSettings);
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (nextTheme) => {
        updateSettings({
          ...settings,
          themeId: settings.themeId === 'system' ? 'default' : settings.themeId,
          dark: nextTheme === 'dark',
        });
      },
      settings,
      setThemeSettings: updateSettings,
      hydrateThemeSettings: (nextSettings) => {
        if (hydratedRef.current) {
          return;
        }
        hydratedRef.current = true;
        setSettings(nextSettings);
      },
      registerThemeSettingsPersistence: (persist) => {
        persistRef.current = persist;
      },
      isSaving,
      setThemeSaving,
      hydrateThemeDefinitions,
      customThemes: definitions ?? [],
      isLoadingCustomThemes: definitions === undefined,
      isCustomThemesError: definitions === null,
      themeDefinition: appliedTheme.definition,
      themeNotice,
    }),
    [
      appliedTheme.definition,
      definitions,
      hydrateThemeDefinitions,
      isSaving,
      settings,
      theme,
      themeNotice,
    ],
  );

  return (
    <ThemeContext value={value}>
      {children}
      {themeNotice === null ? null : (
        <output
          data-theme-notice
          className="fixed inset-x-0 bottom-4 z-50 mx-auto w-fit max-w-lg rounded-control border border-border bg-card px-4 py-2 text-sm text-card-foreground shadow-lg"
        >
          {themeNotice}
        </output>
      )}
    </ThemeContext>
  );
}
