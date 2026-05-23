import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  extensionsQueryKeys,
  fetchProviderDetail,
  ProviderDetailPage,
  removeProvider,
  setProviderEnabled,
} from '@app/extensions';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

export const Route = createFileRoute('/extensions/$providerId')({
  component: ProviderDetailRoute,
});

function ProviderDetailRoute() {
  const { providerId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();

  const { data, isLoading, isError } = useQuery({
    queryKey: extensionsQueryKeys.detail(providerId),
    queryFn: () => fetchProviderDetail(db!, providerId),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (db === null) {
        throw new Error('Database is not ready.');
      }
      const result = await setProviderEnabled(db, providerId, enabled);
      if (!result.ok) {
        throw result.error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: extensionsQueryKeys.all });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (db === null) {
        throw new Error('Database is not ready.');
      }
      const result = await removeProvider(db, providerId);
      if (!result.ok) {
        throw result.error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: extensionsQueryKeys.all });
      void navigate({ to: '/extensions' });
    },
  });

  return (
    <ProviderDetailPage
      providerId={providerId}
      data={data}
      isLoading={dbStatus === 'loading' || isLoading}
      isError={dbStatus === 'error' || isError}
      isUpdating={toggleEnabledMutation.isPending || removeMutation.isPending}
      onBack={() => void navigate({ to: '/extensions' })}
      onToggleEnabled={(enabled) => {
        toggleEnabledMutation.mutate(enabled);
      }}
      onRemove={() => {
        removeMutation.mutate();
      }}
    />
  );
}
