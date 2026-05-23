import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { SETTINGS_NAV_SECTIONS, SettingsIndexPage } from '@app/settings';

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
});

function SettingsRoute() {
  const navigate = useNavigate();

  return (
    <SettingsIndexPage
      sections={SETTINGS_NAV_SECTIONS}
      onNavigate={(to) => void navigate({ to })}
    />
  );
}
