import { createContext, use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  applyThemeToRoot,
  getDefaultThemeSettings,
  resolveThemeAppearance,
  type ThemeSettings,
} from '@app/theme';

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
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

function readStoredThemeSettings(): ThemeSettings | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedPreset = localStorage.getItem('theme-preset-id');
    const storedDark = localStorage.getItem('theme-dark');
    if (storedPreset && (storedDark === 'true' || storedDark === 'false')) {
      return {
        presetId: storedPreset,
        dark: storedDark === 'true',
      };
    }
  } catch {
    // Ignore storage failures in private browsing.
  }

  return null;
}

function persistThemeLocally(settings: ThemeSettings): void {
  try {
    localStorage.setItem('theme-preset-id', settings.presetId);
    localStorage.setItem('theme-dark', String(settings.dark));
    localStorage.setItem('theme', resolveThemeAppearance(settings));
  } catch {
    // Ignore storage failures.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(getDefaultThemeSettings);
  const [isSaving, setThemeSaving] = useState(false);
  const hydratedRef = useRef(false);
  const persistRef = useRef<ThemeSettingsPersistence | null>(null);

  const theme = resolveThemeAppearance(settings);

  useEffect(() => {
    const stored = readStoredThemeSettings();
    if (stored !== null && !hydratedRef.current) {
      setSettings(stored);
    }
  }, []);

  useEffect(() => {
    applyThemeToRoot(document.documentElement, settings);
    persistThemeLocally(settings);
  }, [settings]);

  useEffect(() => {
    if (settings.presetId !== 'system') {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      applyThemeToRoot(document.documentElement, settings);
    };

    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [settings]);

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
          presetId: settings.presetId === 'system' ? 'default' : settings.presetId,
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
    }),
    [isSaving, settings, theme],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
