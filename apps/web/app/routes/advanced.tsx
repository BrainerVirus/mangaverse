import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@app/design-system';
import { SETTINGS_NAV_SECTIONS } from '@app/settings';

export const Route = createFileRoute('/advanced')({
  component: AdvancedRoute,
});

const ADVANCED_TOOLS = SETTINGS_NAV_SECTIONS.filter((section) => section.title === 'Advanced')
  .flatMap((section) => section.items)
  .filter((item) => item.to !== '/advanced');

function AdvancedRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isIndex = pathname === '/advanced' || pathname === '/advanced/';

  if (!isIndex) {
    return <Outlet />;
  }

  return (
    <section aria-label="Advanced" className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Advanced</h1>
        <p className="text-sm text-muted-foreground">
          Tools for customizing themes, troubleshooting, and moving titles between providers.
        </p>
      </div>
      <div className="grid gap-3">
        {ADVANCED_TOOLS.map((item) => (
          <Card key={item.to} className="transition-colors hover:bg-muted/40">
            <Link to={item.to} className="block w-full text-left">
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                <div>
                  <CardTitle className="text-base">{item.label}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </div>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </CardHeader>
            </Link>
          </Card>
        ))}
      </div>
    </section>
  );
}
