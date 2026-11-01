import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAppPlatformAdapter,
  DiagnosticsPage,
  diagnosticsQueryKeys,
  EventLogSection,
  fetchDiagnosticsReport,
} from '@/features/diagnostics/index.js';

import { eventLog } from '../lib/event-log.js';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';
import { usePlatform } from '../providers/platform-provider.js';

export const Route = createFileRoute('/advanced/diagnostics')({
  component: DiagnosticsRoute,
});

function DiagnosticsRoute() {
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const { capabilities } = usePlatform();
  const adapter = createAppPlatformAdapter();

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: diagnosticsQueryKeys.report(),
    queryFn: () =>
      fetchDiagnosticsReport({
        adapter,
        capabilities,
        db: dbStatus === 'ready' ? db : null,
      }),
    enabled: dbStatus !== 'loading',
  });

  const events = useQuery({
    queryKey: diagnosticsQueryKeys.events(),
    queryFn: () => eventLog.list(),
  });

  const isLoading = dbStatus === 'loading';
  const hasDbError = dbStatus === 'error';

  return (
    <>
      <DiagnosticsPage
        isLoading={isLoading}
        isError={hasDbError || isError}
        isRefreshing={isFetching}
        report={data ?? null}
        capabilities={capabilities}
        onRefresh={() => {
          void refetch();
          void queryClient.invalidateQueries({ queryKey: diagnosticsQueryKeys.all });
        }}
        onCopyReport={async (text) => {
          const writeResult = await adapter.clipboard.writeText(text);
          if (!writeResult.ok) {
            throw writeResult.error;
          }
        }}
      />
      <EventLogSection
        events={events.data ?? []}
        onClear={async () => {
          await eventLog.clear();
          await queryClient.invalidateQueries({ queryKey: diagnosticsQueryKeys.events() });
        }}
        onExport={() => eventLog.export()}
      />
    </>
  );
}
