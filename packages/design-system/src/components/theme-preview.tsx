import type { CSSProperties } from 'react';

type ThemePreviewStyle = CSSProperties & {
  [variable: `--${string}`]: string | number | undefined;
};

export interface ThemeDefinition {
  id: string;
  name: string;
  background: string;
  foreground: string;
  surface: string;
  accent: string;
  border: string;
  readerBackground: string;
  primary: string;
  destructive: string;
  success: string;
  warning: string;
}

export interface ThemePreviewProps {
  theme: ThemeDefinition;
}

export function ThemePreview({ theme }: ThemePreviewProps) {
  // Preset colors are runtime data, passed through CSS variables into semantic utilities.
  return (
    <div
      data-theme-preview=""
      className="relative flex h-full w-full flex-col overflow-hidden rounded-box border p-4 transition-shadow hover:shadow-md theme-preview-color theme-preview-border"
      style={
        {
          '--theme-preview-color': theme.background,
          '--theme-preview-border': theme.border,
        } as ThemePreviewStyle
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <span
          className="theme-preview-text text-sm font-semibold"
          style={{ '--theme-preview-color': theme.foreground } as ThemePreviewStyle}
        >
          {theme.name}
        </span>
      </div>

      <div className="mb-3 flex gap-2">
        <div
          className="theme-preview-color h-10 flex-1 rounded-control"
          style={{ '--theme-preview-color': theme.surface } as ThemePreviewStyle}
        />
        <div
          className="theme-preview-color h-10 flex-1 rounded-control"
          style={{ '--theme-preview-color': theme.accent } as ThemePreviewStyle}
        />
        <div
          className="theme-preview-color h-10 flex-1 rounded-control"
          style={{ '--theme-preview-color': theme.primary } as ThemePreviewStyle}
        />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div
          className="theme-preview-color h-12 w-8 rounded-control"
          style={{ '--theme-preview-color': theme.surface } as ThemePreviewStyle}
        />
        <div className="flex-1">
          <div
            className="theme-preview-color mb-1 h-3 w-3/4 rounded"
            style={{ '--theme-preview-color': theme.foreground } as ThemePreviewStyle}
          />
          <div
            className="theme-preview-color h-2 w-1/2 rounded opacity-50"
            style={{ '--theme-preview-color': theme.foreground } as ThemePreviewStyle}
          />
        </div>
      </div>

      <div
        className="theme-preview-color mb-3 rounded-control p-2"
        style={{ '--theme-preview-color': theme.readerBackground } as ThemePreviewStyle}
      >
        <div className="flex gap-1">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="theme-preview-color h-16 flex-1 rounded opacity-80"
              style={{ '--theme-preview-color': theme.surface } as ThemePreviewStyle}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <div
          className="theme-preview-color h-6 flex-1 rounded-full"
          style={{ '--theme-preview-color': theme.success } as ThemePreviewStyle}
        />
        <div
          className="theme-preview-color h-6 flex-1 rounded-full"
          style={{ '--theme-preview-color': theme.warning } as ThemePreviewStyle}
        />
        <div
          className="theme-preview-color h-6 flex-1 rounded-full"
          style={{ '--theme-preview-color': theme.destructive } as ThemePreviewStyle}
        />
      </div>
    </div>
  );
}
