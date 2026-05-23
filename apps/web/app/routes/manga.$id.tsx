import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchMangaDetail, libraryQueryKeys, MangaDetailPage } from '@app/library';
import { toMangaId } from '@app/shared';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

export const Route = createFileRoute('/manga/$id')({
  component: MangaDetailRoute,
});

function MangaDetailRoute() {
  const navigate = useNavigate();
  const { id } = Route.useParams();
  const mangaId = toMangaId(id);
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();

  const { data, isLoading, isError } = useQuery({
    queryKey: libraryQueryKeys.detail(mangaId),
    queryFn: () => fetchMangaDetail(db!, mangaId),
    enabled: dbStatus === 'ready' && db !== null,
  });

  return (
    <MangaDetailPage
      mangaId={mangaId}
      data={data}
      isLoading={dbStatus === 'loading' || isLoading}
      isError={dbStatus === 'error' || isError}
      onBack={() => void navigate({ to: '/library' })}
      onOpenChapter={(chapterId) =>
        void navigate({ to: '/reader/$chapterId', params: { chapterId } })
      }
    />
  );
}
