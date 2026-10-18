import { Badge, Button, EmptyState, ErrorState, LoadingState } from '@app/design-system';
import { CachedCoverImage, getDefaultProviderId } from '@app/cache';
import type { ChapterId, MangaId } from '@app/shared';
import { Heart, Library, Trash2 } from 'lucide-react';
import type { MangaDetailData } from '../types.js';

export interface MangaDetailPageProps {
  mangaId: MangaId;
  data: MangaDetailData | null | undefined;
  isLoading: boolean;
  isError: boolean;
  onBack?: () => void;
  onOpenChapter: (chapterId: ChapterId) => void;
  onAddToLibrary?: () => void;
  onRemoveFromLibrary?: () => void;
  onToggleFavorite?: () => void;
  isLibraryActionPending?: boolean;
}

function formatPeople(names: readonly { name: string }[]): string | undefined {
  if (names.length === 0) return undefined;
  return names.map((person) => person.name).join(', ');
}

interface LibraryActionProps {
  libraryEntry: MangaDetailData['libraryEntry'];
  onAddToLibrary: (() => void) | undefined;
  onRemoveFromLibrary: (() => void) | undefined;
  onToggleFavorite: (() => void) | undefined;
  isLibraryActionPending: boolean;
}

function LibraryActions({
  libraryEntry,
  onAddToLibrary,
  onRemoveFromLibrary,
  onToggleFavorite,
  isLibraryActionPending,
}: LibraryActionProps) {
  const inLibrary = libraryEntry !== undefined;
  const isFavorite = libraryEntry?.favorite === true;

  return (
    <div className="flex flex-wrap gap-3">
      {!inLibrary && onAddToLibrary !== undefined ? (
        <Button
          type="button"
          variant="secondary"
          disabled={isLibraryActionPending}
          onClick={onAddToLibrary}
        >
          <Library aria-hidden className="size-4" />
          Add to library
        </Button>
      ) : null}

      {inLibrary && onToggleFavorite !== undefined ? (
        <Button
          type="button"
          variant={isFavorite ? 'default' : 'outline'}
          disabled={isLibraryActionPending}
          onClick={onToggleFavorite}
          aria-pressed={isFavorite}
        >
          <Heart aria-hidden className={`size-4 ${isFavorite ? 'fill-current' : ''}`} />
          {isFavorite ? 'Favorited' : 'Favorite'}
        </Button>
      ) : null}

      {inLibrary && onRemoveFromLibrary !== undefined ? (
        <Button
          type="button"
          variant="ghost"
          disabled={isLibraryActionPending}
          onClick={onRemoveFromLibrary}
        >
          <Trash2 aria-hidden className="size-4" />
          Remove from library
        </Button>
      ) : null}
    </div>
  );
}

interface SummaryProps {
  data: MangaDetailData;
  onOpenChapter: (chapterId: ChapterId) => void;
  libraryEntry: MangaDetailData['libraryEntry'];
  onAddToLibrary: (() => void) | undefined;
  onRemoveFromLibrary: (() => void) | undefined;
  onToggleFavorite: (() => void) | undefined;
  isLibraryActionPending: boolean;
}

function MangaSummary({
  data,
  onOpenChapter,
  onAddToLibrary,
  onRemoveFromLibrary,
  onToggleFavorite,
  isLibraryActionPending,
}: SummaryProps) {
  const { manga, libraryEntry, continueChapterId } = data;
  const authors = formatPeople(manga.authors);
  const artists = formatPeople(manga.artists);
  const defaultProvider = manga.providerMappings.find(
    (mapping) => mapping.id === manga.defaultProviderMappingId,
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{manga.canonicalTitle}</h1>

        {manga.alternativeTitles.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {manga.alternativeTitles.map((title) => title.value).join(' · ')}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{manga.status}</Badge>
          {manga.contentRating !== 'safe' && manga.contentRating !== 'unknown' ? (
            <Badge variant="destructive">{manga.contentRating}</Badge>
          ) : null}
          {libraryEntry !== undefined ? <Badge variant="outline">In library</Badge> : null}
        </div>
      </div>

      <dl className="grid gap-2 text-sm">
        {authors !== undefined ? (
          <div>
            <dt className="font-medium text-muted-foreground">Author</dt>
            <dd>{authors}</dd>
          </div>
        ) : null}
        {artists !== undefined ? (
          <div>
            <dt className="font-medium text-muted-foreground">Artist</dt>
            <dd>{artists}</dd>
          </div>
        ) : null}
        {defaultProvider !== undefined ? (
          <div>
            <dt className="font-medium text-muted-foreground">Source</dt>
            <dd>{defaultProvider.providerId}</dd>
          </div>
        ) : null}
      </dl>

      {manga.description !== undefined && manga.description.length > 0 ? (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {manga.description}
        </p>
      ) : null}

      {manga.tags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {manga.tags.map((tag) => (
            <Badge key={tag.id} variant="outline">
              {tag.label}
            </Badge>
          ))}
        </div>
      ) : null}

      {continueChapterId !== undefined ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => onOpenChapter(continueChapterId)}>
            {libraryEntry?.lastReadChapterId !== undefined ? 'Continue reading' : 'Start reading'}
          </Button>
        </div>
      ) : null}

      <LibraryActions
        libraryEntry={libraryEntry}
        onAddToLibrary={onAddToLibrary}
        onRemoveFromLibrary={onRemoveFromLibrary}
        onToggleFavorite={onToggleFavorite}
        isLibraryActionPending={isLibraryActionPending}
      />
    </div>
  );
}

function ChapterList({
  chapters,
  onOpenChapter,
}: {
  chapters: MangaDetailData['chapters'];
  onOpenChapter: (chapterId: ChapterId) => void;
}) {
  if (chapters.length === 0) {
    return <EmptyState type="no-chapters" />;
  }

  return (
    <ol className="divide-y divide-[var(--border)] rounded-[var(--radius-box)] border border-[var(--border)]">
      {chapters.map((chapter) => (
        <li key={chapter.id}>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            onClick={() => onOpenChapter(chapter.id)}
          >
            <span className="font-medium">{chapter.title}</span>
            {chapter.volume !== undefined ? (
              <span className="text-sm text-muted-foreground">{chapter.volume}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ol>
  );
}

export function MangaDetailPage({
  data,
  isLoading,
  isError,
  onBack,
  onOpenChapter,
  onAddToLibrary,
  onRemoveFromLibrary,
  onToggleFavorite,
  isLibraryActionPending = false,
}: MangaDetailPageProps) {
  if (isLoading) {
    return (
      <section aria-label="Manga details" className="p-6">
        <LoadingState type="detail" />
      </section>
    );
  }

  if (isError) {
    return (
      <section aria-label="Manga details" className="p-6">
        <ErrorState
          title="Could not load manga"
          message="Local data failed to load. Try again in a moment."
        />
      </section>
    );
  }

  if (data === undefined || data === null) {
    return (
      <section aria-label="Manga details" className="p-6">
        <EmptyState type="no-results" />
      </section>
    );
  }

  const { manga, chapters } = data;

  return (
    <section aria-label="Manga details" className="flex flex-col gap-8 p-6">
      <div className="flex flex-wrap items-start gap-6">
        {onBack !== undefined ? (
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
        ) : null}

        <div className="flex flex-1 flex-col gap-6 md:flex-row">
          {manga.coverImageUrl ? (
            <div className="mx-auto w-40 shrink-0 overflow-hidden rounded-[var(--radius-box)] border border-[var(--border)] bg-muted md:mx-0 md:w-48">
              <CachedCoverImage
                providerId={getDefaultProviderId(manga)}
                mangaId={manga.id}
                remoteUrl={manga.coverImageUrl}
                alt={manga.canonicalTitle}
                className="aspect-[3/4] w-full object-cover"
              />
            </div>
          ) : null}

          <MangaSummary
            data={data}
            onOpenChapter={onOpenChapter}
            libraryEntry={data.libraryEntry}
            onAddToLibrary={onAddToLibrary}
            onRemoveFromLibrary={onRemoveFromLibrary}
            onToggleFavorite={onToggleFavorite}
            isLibraryActionPending={isLibraryActionPending}
          />
        </div>
      </div>

      <section aria-label="Chapters" className="space-y-4">
        <h2 className="text-xl font-semibold">Chapters</h2>

        <ChapterList chapters={chapters} onOpenChapter={onOpenChapter} />
      </section>
    </section>
  );
}
