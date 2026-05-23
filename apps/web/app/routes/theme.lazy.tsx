import { createLazyFileRoute } from '@tanstack/react-router';
import { ThemeCustomizationPage } from '@app/theme';

import { useLocalDbStatus } from '../providers/local-db-provider.js';
import { useTheme } from '../providers/theme-provider.js';

export const Route = createLazyFileRoute('/theme')({
  component: ThemeRoute,
});

function ThemeRoute() {
  const dbStatus = useLocalDbStatus();
  const { settings, setThemeSettings, isSaving } = useTheme();

  return (
    <ThemeCustomizationPage
      settings={settings}
      isLoading={dbStatus === 'loading'}
      isError={dbStatus === 'error'}
      isSaving={isSaving}
      onChange={setThemeSettings}
    />
  );
}
