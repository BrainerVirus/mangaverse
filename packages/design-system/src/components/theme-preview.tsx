import { cn } from '../lib/cn.js';

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
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[var(--radius-box)] border p-4 transition-all hover:shadow-md',
        'w-full max-w-[280px]'
      )}
      style={{ backgroundColor: theme.background, borderColor: theme.border }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: theme.foreground }}>
          {theme.name}
        </span>
      </div>

      <div className="mb-3 flex gap-2">
        <div
          className="h-10 flex-1 rounded-[var(--radius-control)]"
          style={{ backgroundColor: theme.surface }}
        />
        <div
          className="h-10 flex-1 rounded-[var(--radius-control)]"
          style={{ backgroundColor: theme.accent }}
        />
        <div
          className="h-10 flex-1 rounded-[var(--radius-control)]"
          style={{ backgroundColor: theme.primary }}
        />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div
          className="h-12 w-8 rounded-[var(--radius-control)]"
          style={{ backgroundColor: theme.surface }}
        />
        <div className="flex-1">
          <div
            className="mb-1 h-3 w-3/4 rounded"
            style={{ backgroundColor: theme.foreground }}
          />
          <div
            className="h-2 w-1/2 rounded"
            style={{ backgroundColor: theme.foreground, opacity: 0.5 }}
          />
        </div>
      </div>

      <div className="mb-3 rounded-[var(--radius-control)] p-2" style={{ backgroundColor: theme.readerBackground }}>
        <div className="flex gap-1">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 flex-1 rounded"
              style={{ backgroundColor: theme.surface, opacity: 0.8 }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <div
          className="h-6 flex-1 rounded-full"
          style={{ backgroundColor: theme.success }}
        />
        <div
          className="h-6 flex-1 rounded-full"
          style={{ backgroundColor: theme.warning }}
        />
        <div
          className="h-6 flex-1 rounded-full"
          style={{ backgroundColor: theme.destructive }}
        />
      </div>
    </div>
  );
}