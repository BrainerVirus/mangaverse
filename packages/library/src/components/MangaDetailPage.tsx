import { useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/design-system';
import { CachedCoverImage, getDefaultProviderId } from '@app/cache';
import {
  LIBRARY_STATUS_OPTIONS,
  compareLibraryCategories,
  libraryStatusLabel,
  toReadableDescription,
  type CategoryId,
  type Chapter,
  type ChapterId,
  type LibraryCategory,
  type LibraryEntry,
  type LibraryStatus,
  type MangaId,
  type MangaIdentity,
} from '@app/shared';
import { Heart, Library, Trash2 } from 'lucide-react';
import type { MangaDetailData } from '../types.js';
import { ConfirmRemoveFromLibraryDialog } from './ConfirmRemoveFromLibraryDialog.js';

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
  onCategoriesChange?: (categoryIds: readonly CategoryId[]) => Promise<void> | void;
  onStatusChange?: (status: LibraryStatus) => void;
  isLibraryActionPending?: boolean;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateFormatter.format(date);
}

function formatPeople(names: readonly { name: string }[]): string | undefined {
  if (names.length === 0) return undefined;
  return names.map((person) => person.name).join(', ');
}

interface LibraryActionProps {
  libraryEntry: MangaDetailData['libraryEntry'];
  mangaTitle: string;
  onAddToLibrary: (() => void) | undefined;
  onRemoveFromLibrary: (() => void) | undefined;
  onToggleFavorite: (() => void) | undefined;
  isLibraryActionPending: boolean;
}

function LibraryActions({
  libraryEntry,
  mangaTitle,
  onAddToLibrary,
  onRemoveFromLibrary,
  onToggleFavorite,
  isLibraryActionPending,
}: LibraryActionProps) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
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
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={isLibraryActionPending}
            onClick={() => setConfirmingRemove(true)}
          >
            <Trash2 aria-hidden className="size-4" />
            Remove from library
          </Button>
          <ConfirmRemoveFromLibraryDialog
            open={confirmingRemove}
            mangaTitle={mangaTitle}
            isRemoving={isLibraryActionPending}
            onOpenChange={setConfirmingRemove}
            onConfirm={() => {
              setConfirmingRemove(false);
              onRemoveFromLibrary();
            }}
          />
        </>
      ) : null}
    </div>
  );
}

interface CategoryEditorProps {
  categories: readonly LibraryCategory[];
  selectedCategoryIds: readonly CategoryId[];
  disabled: boolean;
  onChange: (categoryIds: readonly CategoryId[]) => Promise<void> | void;
}

function CategoryEditor({
  categories,
  selectedCategoryIds,
  disabled,
  onChange,
}: CategoryEditorProps) {
  const [error, setError] = useState<string | undefined>();
  const ordered = [...categories].sort(compareLibraryCategories);
  const selectedSet = new Set(selectedCategoryIds);
  if (ordered.length === 0) return null;

  function toggle(categoryId: CategoryId): void {
    const next = selectedSet.has(categoryId)
      ? selectedCategoryIds.filter((id) => id !== categoryId)
      : [...selectedCategoryIds, categoryId];
    setError(undefined);
    // Keep the editor open and the current selection unchanged when the write fails.
    void Promise.resolve(onChange(next)).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Could not update categories.');
    });
  }

  return (
    <fieldset className="flex flex-col gap-2" aria-label="Categories">
      <legend className="text-sm font-medium text-muted-foreground">Categories</legend>
      <div className="flex flex-wrap gap-2">
        {ordered.map((category) => {
          const selected = selectedSet.has(category.id);
          return (
            <Button
              key={category.id}
              type="button"
              size="sm"
              variant={selected ? 'default' : 'outline'}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => toggle(category.id)}
            >
              {category.name}
            </Button>
          );
        })}
      </div>
      {error !== undefined ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

interface LibraryStatusPickerProps {
  readonly status: LibraryStatus;
  readonly disabled: boolean;
  readonly onChange: (status: LibraryStatus) => void;
}

/** Quick status change on the title itself; the library grid also supports it in bulk. */
function LibraryStatusPicker({ status, disabled, onChange }: LibraryStatusPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">Reading status</span>
      <Select
        value={status}
        onValueChange={(value) => {
          const next = LIBRARY_STATUS_OPTIONS.find((option) => option.value === value);
          if (next !== undefined) onChange(next.value);
        }}
      >
        <SelectTrigger className="h-9 w-40" aria-label="Reading status" disabled={disabled}>
          <SelectValue placeholder={libraryStatusLabel(status)} />
        </SelectTrigger>
        <SelectContent>
          {LIBRARY_STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface ReadingFactsProps {
  readonly entry: LibraryEntry;
  readonly chapters: readonly Chapter[];
}

function latestChapter(chapters: readonly Chapter[]): Chapter | undefined {
  return chapters.reduce<Chapter | undefined>(
    (best, chapter) => (best === undefined || chapter.index > best.index ? chapter : best),
    undefined,
  );
}

/**
 * Per-title progress facts. The updated stamp prefers the provider's release
 * date and falls back to the row's `createdAt`: a provider re-check bumps
 * `updatedAt` on unchanged chapters too, so that column would claim a new
 * chapter every check.
 */
function ReadingFacts({ entry, chapters }: ReadingFactsProps) {
  const lastRead = chapters.find((chapter) => chapter.id === entry.lastReadChapterId);
  const newest = latestChapter(chapters);
  const updatedAt = newest?.publishedAt ?? newest?.createdAt;

  return (
    <dl className="grid gap-2 text-sm">
      <div>
        <dt className="font-medium text-muted-foreground">Unread</dt>
        <dd>{entry.unreadCount === 1 ? '1 chapter' : `${entry.unreadCount} chapters`}</dd>
      </div>
      <div>
        <dt className="font-medium text-muted-foreground">Last read</dt>
        <dd>{lastRead?.title ?? 'Not started'}</dd>
      </div>
      {updatedAt !== undefined ? (
        <div>
          <dt className="font-medium text-muted-foreground">Last updated</dt>
          <dd>
            <time dateTime={updatedAt}>{formatDate(updatedAt)}</time>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

interface SummaryProps {
  data: MangaDetailData;
  onOpenChapter: (chapterId: ChapterId) => void;
  libraryEntry: MangaDetailData['libraryEntry'];
  onAddToLibrary: (() => void) | undefined;
  onRemoveFromLibrary: (() => void) | undefined;
  onToggleFavorite: (() => void) | undefined;
  onCategoriesChange: ((categoryIds: readonly CategoryId[]) => Promise<void> | void) | undefined;
  onStatusChange: ((status: LibraryStatus) => void) | undefined;
  isLibraryActionPending: boolean;
}

function MangaSummaryHeader({ manga, inLibrary }: { manga: MangaIdentity; inLibrary: boolean }) {
  return (
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
        {inLibrary ? <Badge variant="outline">In library</Badge> : null}
      </div>
    </div>
  );
}

function MangaFacts({ manga }: { manga: MangaIdentity }) {
  const authors = formatPeople(manga.authors);
  const artists = formatPeople(manga.artists);
  const description =
    manga.description === undefined ? '' : toReadableDescription(manga.description);
  const defaultProvider = manga.providerMappings.find(
    (mapping) => mapping.id === manga.defaultProviderMappingId,
  );

  return (
    <>
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

      {description.length > 0 ? (
        <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {description}
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
    </>
  );
}

function ReadingAction({
  continueChapterId,
  hasLastReadChapter,
  onOpenChapter,
}: {
  continueChapterId: ChapterId | undefined;
  hasLastReadChapter: boolean;
  onOpenChapter: (chapterId: ChapterId) => void;
}) {
  if (continueChapterId === undefined) return null;
  return (
    <div className="flex flex-wrap gap-3">
      <Button type="button" onClick={() => onOpenChapter(continueChapterId)}>
        {hasLastReadChapter ? 'Continue reading' : 'Start reading'}
      </Button>
    </div>
  );
}

function MangaSummary({
  data,
  onOpenChapter,
  onAddToLibrary,
  onRemoveFromLibrary,
  onToggleFavorite,
  onCategoriesChange,
  onStatusChange,
  isLibraryActionPending,
}: SummaryProps) {
  const { manga, libraryEntry, continueChapterId, chapters } = data;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <MangaSummaryHeader manga={manga} inLibrary={libraryEntry !== undefined} />
      <MangaFacts manga={manga} />
      {libraryEntry !== undefined ? (
        <ReadingFacts entry={libraryEntry} chapters={chapters} />
      ) : null}
      <ReadingAction
        continueChapterId={continueChapterId}
        hasLastReadChapter={libraryEntry?.lastReadChapterId !== undefined}
        onOpenChapter={onOpenChapter}
      />

      <LibraryActions
        libraryEntry={libraryEntry}
        mangaTitle={manga.canonicalTitle}
        onAddToLibrary={onAddToLibrary}
        onRemoveFromLibrary={onRemoveFromLibrary}
        onToggleFavorite={onToggleFavorite}
        isLibraryActionPending={isLibraryActionPending}
      />

      {libraryEntry !== undefined && onStatusChange !== undefined ? (
        <LibraryStatusPicker
          status={libraryEntry.status}
          disabled={isLibraryActionPending}
          onChange={onStatusChange}
        />
      ) : null}

      {libraryEntry !== undefined && onCategoriesChange !== undefined ? (
        <CategoryEditor
          categories={data.categories ?? []}
          selectedCategoryIds={libraryEntry.categoryIds}
          disabled={isLibraryActionPending}
          onChange={onCategoriesChange}
        />
      ) : null}
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
    <ol className="divide-y divide-border rounded-box border border-border">
      {chapters.map((chapter) => (
        <li key={chapter.id}>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  onCategoriesChange,
  onStatusChange,
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
        <EmptyState
          type="manga-not-found"
          {...(onBack === undefined
            ? {}
            : { action: { label: 'Back to library', onClick: onBack } })}
        />
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
            <div className="mx-auto w-40 shrink-0 overflow-hidden rounded-box border border-border bg-muted md:mx-0 md:w-48">
              <CachedCoverImage
                providerId={getDefaultProviderId(manga)}
                mangaId={manga.id}
                remoteUrl={manga.coverImageUrl}
                alt={manga.canonicalTitle}
                className="aspect-3/4 w-full object-cover"
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
            onCategoriesChange={onCategoriesChange}
            onStatusChange={onStatusChange}
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
