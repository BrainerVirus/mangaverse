import { PageContainer, PageHeader } from '@app/design-system';
import { ChevronRight, type LucideIcon } from 'lucide-react';

export interface SettingsNavItem {
  readonly label: string;
  readonly description: string;
  readonly to: string;
  readonly icon: LucideIcon;
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
    <PageContainer variant="read">
      <section aria-label="Settings" className="flex flex-col">
        <PageHeader
          title="Settings"
          description="Manage app behavior, reading defaults, and data."
        />

        {sections.map((section, index) => (
          <section
            key={section.title}
            aria-label={section.title}
            className={index === 0 ? 'mt-6' : 'mt-8'}
          >
            <h2 className="type-heading mb-3 text-foreground">{section.title}</h2>
            <ul className="divide-y divide-border overflow-hidden rounded-box border border-border bg-surface">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <button
                      type="button"
                      className="flex min-h-14 w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      onClick={() => onNavigate(item.to)}
                    >
                      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="type-label text-foreground">{item.label}</span>
                        <span className="type-body text-muted-foreground">{item.description}</span>
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </section>
    </PageContainer>
  );
}
