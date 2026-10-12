import { createFileRoute, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { SETTINGS_NAV_SECTIONS, SettingsIndexPage } from '@app/settings';

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
});

function SettingsRoute() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isIndex = pathname === '/settings' || pathname === '/settings/';

  if (!isIndex) {
    return <Outlet />;
  }

  return (
    <SettingsIndexPage
      sections={SETTINGS_NAV_SECTIONS}
      onNavigate={(to) => void navigate({ to })}
    />
  );
}
