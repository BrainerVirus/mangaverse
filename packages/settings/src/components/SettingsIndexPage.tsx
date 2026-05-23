import { ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, SettingsSection } from '@app/design-system';

export interface SettingsNavItem {
  readonly label: string;
  readonly description: string;
  readonly to: string;
}

export interface SettingsIndexPageProps {
  readonly sections: readonly {
    readonly title: string;
    readonly items: readonly SettingsNavItem[];
  }[];
  onNavigate: (to: string) => void;
}

export function SettingsIndexPage({ sections, onNavigate }: SettingsIndexPageProps) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage app behavior, reading defaults, and data.</p>
      </div>

      {sections.map((section) => (
        <SettingsSection key={section.title} title={section.title}>
          <div className="grid gap-3">
            {section.items.map((item) => (
              <Card key={item.to} className="transition-colors hover:bg-muted/40">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => onNavigate(item.to)}
                >
                  <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                    <div>
                      <CardTitle className="text-base">{item.label}</CardTitle>
                      <CardDescription>{item.description}</CardDescription>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </CardHeader>
                  <CardContent className="hidden" />
                </button>
              </Card>
            ))}
          </div>
        </SettingsSection>
      ))}
    </main>
  );
}
