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
  getMangaCoverUrl,
  libraryStatusLabel,
  mangaStatusLabel,
  providerDisplayName,
  toReadableDescription,
  type CategoryId,
  type Chapter,
  type ChapterId,
  type LibraryCategory,
  type LibraryEntry,
  type LibraryStatus,
  type MangaId,
  type MangaIdentity,
  type MangaProviderMapping,
  type ProviderMappingId,
  type TrackingLink,
} from '@app/shared';
import {
  ArrowRightLeft,
  ExternalLink,
  Heart,
  Image,
  Library,
  Settings,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { chaptersForMapping } from '../chapter-list.js';
import type { MangaDetailData } from '../types.js';
import type { MergePreview, UnmergeMappingPreview } from '@app/db';
import { ConfirmRemoveFromLibraryDialog } from './ConfirmRemoveFromLibraryDialog.js';
import { MangaChapterList } from './MangaChapterList.js';
import { MangaCustomCoverDialog } from './MangaCustomCoverDialog.js';
import {
  MangaDuplicatesSection,
  MangaUnmergeDialog,
  type DuplicateCandidatesState,
  type MergeDuplicateInput,
} from './MangaIdentityMerge.js';
import { MangaProviderSwitcher } from './MangaProviderSwitcher.js';
import { MangaRelatedTitles } from './MangaRelatedTitles.js';
import { useUnmergeRequest } from './use-unmerge-request.js';

export interface MangaDetailRelatedState {
  readonly items?: readonly MangaIdentity[];
  readonly isLoading?: boolean;
  readonly error?: string;
  onRetry?: () => void;
}

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
  /** Provider names keyed by provider id; falls back to the raw id. */
  providerLabels?: Readonly<Record<string, string>>;
  isProviderActionPending?: boolean;
  onSelectProvider?: (mappingId: ProviderMappingId) => Promise<void> | void;
  onSetDefaultProvider?: (mappingId: ProviderMappingId) => Promise<void> | void;
  onSetPreferredChapterSource?: (mappingId: ProviderMappingId) => Promise<void> | void;
  isChapterActionPending?: boolean;
  isChaptersLoading?: boolean;
  chaptersError?: string;
  onRetryChapters?: () => void;
  onSetChapterRead?: (chapterId: ChapterId, read: boolean) => Promise<void> | void;
  onMarkPreviousChaptersRead?: (chapterId: ChapterId) => Promise<void> | void;
  isCoverActionPending?: boolean;
  onSetCoverImageUrl?: (url: string | undefined) => Promise<void> | void;
  onOpenMigration?: () => void;
  onOpenProviderSettings?: (providerId: string) => void;
  onOpenReaderSettings?: () => void;
  recommendations?: MangaDetailRelatedState;
  relatedTitles?: MangaDetailRelatedState;
  onOpenRelatedManga?: (mangaId: MangaId) => void;
  /** Local duplicate review; omitted when the caller does not run detection. */
  duplicates?: DuplicateCandidatesState;
  isMergePending?: boolean;
  loadMergePreview?: (targetId: MangaId, sourceId: MangaId) => Promise<MergePreview>;
  onMerge?: (input: MergeDuplicateInput) => Promise<void>;
  onMerged?: (targetId: MangaId) => void;
  isUnmergePending?: boolean;
  loadUnmergePreview?: (mappingId: ProviderMappingId) => Promise<UnmergeMappingPreview | undefined>;
  onUnmerge?: (mappingId: ProviderMappingId) => Promise<void>;
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

function httpUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function TrackingLinks({ links }: { links: readonly TrackingLink[] }) {
  return (
    <div>
      <dt className="font-medium text-muted-foreground">Tracking</dt>
      <dd>
        <ul className="flex flex-col gap-1">
          {links.map((link) => {
            // Backup import can supply any string; only http(s) may become a link.
            const href = link.externalUrl === undefined ? undefined : httpUrl(link.externalUrl);
            return (
              <li key={`${link.service}:${link.externalId}`} className="flex items-center gap-2">
                <span className="font-medium">{link.service}</span>
                {href !== undefined ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                  >
                    {link.externalId}
                    <ExternalLink aria-hidden className="size-3" />
                  </a>
                ) : (
                  <span>{link.externalId}</span>
                )}
                {link.lastSyncedAt !== undefined ? (
                  <span className="text-xs text-muted-foreground">synced {link.lastSyncedAt}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </dd>
    </div>
  );
}

function MangaSummaryHeader({ manga, inLibrary }: { manga: MangaIdentity; inLibrary: boolean }) {
  // `unknown` is the absence of a provider status, so it gets no badge.
  const statusLabel = mangaStatusLabel(manga.status);

  return (
    <div className="min-w-0 space-y-2">
      <h1 className="text-3xl font-bold tracking-tight">{manga.canonicalTitle}</h1>

      {manga.alternativeTitles.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {manga.alternativeTitles.map((title) => title.value).join(' · ')}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {statusLabel !== undefined ? <Badge variant="secondary">{statusLabel}</Badge> : null}
        {manga.contentRating !== 'safe' && manga.contentRating !== 'unknown' ? (
          <Badge variant="destructive">{manga.contentRating}</Badge>
        ) : null}
        {inLibrary ? <Badge variant="outline">In library</Badge> : null}
      </div>
    </div>
  );
}

function MangaFacts({
  manga,
  activeMapping,
  providerLabels,
}: {
  manga: MangaIdentity;
  activeMapping: MangaProviderMapping | undefined;
  providerLabels: Readonly<Record<string, string>> | undefined;
}) {
  const authors = formatPeople(manga.authors);
  const artists = formatPeople(manga.artists);
  const sourceName =
    activeMapping === undefined
      ? undefined
      : providerDisplayName(activeMapping.providerId, providerLabels);
  const description =
    manga.description === undefined ? '' : toReadableDescription(manga.description);

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
        {sourceName !== undefined ? (
          <div>
            <dt className="font-medium text-muted-foreground">Source</dt>
            <dd>{sourceName}</dd>
          </div>
        ) : null}
        {manga.trackingLinks !== undefined && manga.trackingLinks.length > 0 ? (
          <TrackingLinks links={manga.trackingLinks} />
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
            <Badge key={tag.id ?? tag.label} variant="outline">
              {tag.label}
            </Badge>
          ))}
        </div>
      ) : null}
    </>
  );
}

function ShortcutActions({
  activeProviderId,
  hasCustomCover,
  onSetCustomCover,
  onOpenMigration,
  onOpenProviderSettings,
  onOpenReaderSettings,
  isCoverActionPending,
}: {
  activeProviderId: string | undefined;
  hasCustomCover: boolean;
  onSetCustomCover: (() => void) | undefined;
  onOpenMigration: (() => void) | undefined;
  onOpenProviderSettings: ((providerId: string) => void) | undefined;
  onOpenReaderSettings: (() => void) | undefined;
  isCoverActionPending: boolean;
}) {
  if (
    onSetCustomCover === undefined &&
    onOpenMigration === undefined &&
    onOpenProviderSettings === undefined &&
    onOpenReaderSettings === undefined
  ) {
    return null;
  }

  return (
    <fieldset aria-label="Title actions" className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
      {onOpenMigration !== undefined ? (
        <Button type="button" size="sm" variant="outline" onClick={onOpenMigration}>
          <ArrowRightLeft aria-hidden className="size-4" />
          Migrate
        </Button>
      ) : null}
      {onOpenProviderSettings !== undefined && activeProviderId !== undefined ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onOpenProviderSettings(activeProviderId)}
        >
          <Settings aria-hidden className="size-4" />
          Provider settings
        </Button>
      ) : null}
      {onOpenReaderSettings !== undefined ? (
        <Button type="button" size="sm" variant="outline" onClick={onOpenReaderSettings}>
          <SlidersHorizontal aria-hidden className="size-4" />
          Reader settings
        </Button>
      ) : null}
      {onSetCustomCover !== undefined ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isCoverActionPending}
          onClick={onSetCustomCover}
        >
          <Image aria-hidden className="size-4" />
          {hasCustomCover ? 'Change cover' : 'Custom cover'}
        </Button>
      ) : null}
    </fieldset>
  );
}

function ReadingAction({
  chapter,
  isContinue,
  onOpenChapter,
}: {
  chapter: MangaDetailData['chapters'][number] | undefined;
  isContinue: boolean;
  onOpenChapter: (chapterId: ChapterId) => void;
}) {
  if (chapter === undefined) return null;
  return (
    <div className="flex flex-wrap gap-3">
      <Button type="button" onClick={() => onOpenChapter(chapter.id)}>
        {isContinue ? 'Continue reading' : 'Start reading'}
      </Button>
    </div>
  );
}

interface SummaryProps {
  data: MangaDetailData;
  activeMapping: MangaProviderMapping | undefined;
  providerLabels: Readonly<Record<string, string>> | undefined;
  continueChapter: MangaDetailData['chapters'][number] | undefined;
  hasLastReadChapter: boolean;
  onOpenChapter: (chapterId: ChapterId) => void;
  onAddToLibrary: (() => void) | undefined;
  onRemoveFromLibrary: (() => void) | undefined;
  onToggleFavorite: (() => void) | undefined;
  onCategoriesChange: ((categoryIds: readonly CategoryId[]) => Promise<void> | void) | undefined;
  onStatusChange: ((status: LibraryStatus) => void) | undefined;
  isLibraryActionPending: boolean;
  onOpenMigration: (() => void) | undefined;
  onOpenProviderSettings: ((providerId: string) => void) | undefined;
  onOpenReaderSettings: (() => void) | undefined;
  onSetCustomCover: (() => void) | undefined;
  hasCustomCover: boolean;
  isCoverActionPending: boolean;
}

function MangaSummary({
  data,
  activeMapping,
  providerLabels,
  continueChapter,
  hasLastReadChapter,
  onOpenChapter,
  onAddToLibrary,
  onRemoveFromLibrary,
  onToggleFavorite,
  onCategoriesChange,
  onStatusChange,
  isLibraryActionPending,
  onOpenMigration,
  onOpenProviderSettings,
  onOpenReaderSettings,
  onSetCustomCover,
  hasCustomCover,
  isCoverActionPending,
}: SummaryProps) {
  const { manga, libraryEntry, chapters } = data;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <MangaSummaryHeader manga={manga} inLibrary={libraryEntry !== undefined} />
      <MangaFacts manga={manga} activeMapping={activeMapping} providerLabels={providerLabels} />
      {libraryEntry !== undefined ? (
        <ReadingFacts entry={libraryEntry} chapters={chapters} />
      ) : null}
      <ReadingAction
        chapter={continueChapter}
        isContinue={hasLastReadChapter}
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

      <ShortcutActions
        activeProviderId={activeMapping === undefined ? undefined : activeMapping.providerId}
        hasCustomCover={hasCustomCover}
        onSetCustomCover={onSetCustomCover}
        onOpenMigration={onOpenMigration}
        onOpenProviderSettings={onOpenProviderSettings}
        onOpenReaderSettings={onOpenReaderSettings}
        isCoverActionPending={isCoverActionPending}
      />

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
interface MangaDetailView {
  readonly data: MangaDetailData;
  readonly activeMapping?: MangaProviderMapping;
  readonly activeMappingId?: ProviderMappingId;
  readonly activeChapters: readonly Chapter[];
  readonly continueChapter?: Chapter;
  readonly lastReadChapter?: Chapter;
  readonly customCoverUrl?: string;
  readonly coverUrl?: string;
}

/** Derived display state for one viewed mapping, kept out of the render component. */
function buildMangaDetailView(
  data: MangaDetailData,
  viewedMappingId: ProviderMappingId | null,
): MangaDetailView {
  const { manga, chapters, libraryEntry } = data;
  const mappings = manga.providerMappings;
  const persistedMappingId =
    libraryEntry?.activeProviderMappingId ??
    manga.preferredChapterSourceId ??
    manga.defaultProviderMappingId;
  const activeMapping =
    mappings.find((mapping) => mapping.id === (viewedMappingId ?? persistedMappingId)) ??
    mappings.find((mapping) => mapping.id === manga.defaultProviderMappingId) ??
    mappings[0];
  const activeMappingId = activeMapping?.id;
  const activeChapters = chaptersForMapping(chapters, activeMappingId);
  const lastReadInActive = activeChapters.find(
    (chapter) => chapter.id === libraryEntry?.lastReadChapterId,
  );
  // A migrated mapping may have no local chapters yet; the stored last read
  // still has to open, exactly as it did before the mapping split.
  const lastReadChapter = chapters.find(
    (chapter) => chapter.id === libraryEntry?.lastReadChapterId,
  );
  const continueChapter = lastReadInActive ?? activeChapters[0] ?? lastReadChapter;
  const customCoverUrl = manga.userOverrides?.coverImageUrl;
  const coverUrl = getMangaCoverUrl(manga);

  return {
    data,
    activeChapters,
    ...(activeMapping === undefined ? {} : { activeMapping }),
    ...(activeMappingId === undefined ? {} : { activeMappingId }),
    ...(continueChapter === undefined ? {} : { continueChapter }),
    ...(lastReadChapter === undefined ? {} : { lastReadChapter }),
    ...(customCoverUrl === undefined ? {} : { customCoverUrl }),
    ...(coverUrl === undefined ? {} : { coverUrl }),
  };
}

interface MangaDetailHeaderProps {
  readonly view: MangaDetailView;
  readonly providerLabels: Readonly<Record<string, string>> | undefined;
  readonly isLibraryActionPending: boolean;
  readonly isCoverActionPending: boolean;
  onBack: (() => void) | undefined;
  onOpenChapter: (chapterId: ChapterId) => void;
  onAddToLibrary: (() => void) | undefined;
  onRemoveFromLibrary: (() => void) | undefined;
  onToggleFavorite: (() => void) | undefined;
  onCategoriesChange: ((categoryIds: readonly CategoryId[]) => Promise<void> | void) | undefined;
  onStatusChange: ((status: LibraryStatus) => void) | undefined;
  onOpenMigration: (() => void) | undefined;
  onOpenProviderSettings: ((providerId: string) => void) | undefined;
  onOpenReaderSettings: (() => void) | undefined;
  onOpenCover: (() => void) | undefined;
}

function MangaDetailHeader({
  view,
  providerLabels,
  isLibraryActionPending,
  isCoverActionPending,
  onBack,
  onOpenChapter,
  onAddToLibrary,
  onRemoveFromLibrary,
  onToggleFavorite,
  onCategoriesChange,
  onStatusChange,
  onOpenMigration,
  onOpenProviderSettings,
  onOpenReaderSettings,
  onOpenCover,
}: MangaDetailHeaderProps) {
  const { data, activeMapping, continueChapter, lastReadChapter, customCoverUrl, coverUrl } = view;

  return (
    // On a phone Back is its own row, so the summary below it owns the full
    // content width instead of losing a column to the button. On `md` the two
    // sit side by side again, and `items-start` keeps the cover from stretching
    // to the summary's height (that stretch painted an empty box under it).
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
      {onBack !== undefined ? (
        <div className="md:pt-1">
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-6 md:flex-row md:items-start">
        {coverUrl !== undefined ? (
          <div className="mx-auto w-40 shrink-0 self-start overflow-hidden rounded-box border border-border bg-muted md:mx-0 md:w-48">
            <CachedCoverImage
              providerId={getDefaultProviderId(data.manga)}
              mangaId={data.manga.id}
              remoteUrl={coverUrl}
              alt={data.manga.canonicalTitle}
              className="aspect-3/4 w-full object-cover"
            />
          </div>
        ) : null}

        <MangaSummary
          data={data}
          activeMapping={activeMapping}
          providerLabels={providerLabels}
          continueChapter={continueChapter}
          hasLastReadChapter={lastReadChapter !== undefined}
          onOpenChapter={onOpenChapter}
          onAddToLibrary={onAddToLibrary}
          onRemoveFromLibrary={onRemoveFromLibrary}
          onToggleFavorite={onToggleFavorite}
          onCategoriesChange={onCategoriesChange}
          onStatusChange={onStatusChange}
          isLibraryActionPending={isLibraryActionPending}
          onOpenMigration={onOpenMigration}
          onOpenProviderSettings={onOpenProviderSettings}
          onOpenReaderSettings={onOpenReaderSettings}
          onSetCustomCover={onOpenCover}
          hasCustomCover={customCoverUrl !== undefined}
          isCoverActionPending={isCoverActionPending}
        />
      </div>
    </div>
  );
}

function MangaProvidersSection({
  view,
  providerLabels,
  isPending,
  onSelectProvider,
  onSetDefaultProvider,
  onSetPreferredChapterSource,
  onRequestUnmerge,
}: {
  readonly view: MangaDetailView;
  readonly providerLabels: Readonly<Record<string, string>> | undefined;
  readonly isPending: boolean;
  onSelectProvider: ((mappingId: ProviderMappingId) => Promise<void> | void) | undefined;
  onSetDefaultProvider: ((mappingId: ProviderMappingId) => Promise<void> | void) | undefined;
  onSetPreferredChapterSource: ((mappingId: ProviderMappingId) => Promise<void> | void) | undefined;
  onRequestUnmerge: ((mappingId: ProviderMappingId) => void) | undefined;
}) {
  const { data, activeMappingId } = view;
  const { manga } = data;

  return (
    <MangaProviderSwitcher
      mappings={manga.providerMappings}
      defaultMappingId={manga.defaultProviderMappingId}
      activeMappingId={activeMappingId ?? manga.defaultProviderMappingId}
      {...(manga.preferredChapterSourceId === undefined
        ? {}
        : { preferredMappingId: manga.preferredChapterSourceId })}
      {...(providerLabels === undefined ? {} : { providerLabels })}
      isPending={isPending}
      {...(onSelectProvider === undefined ? {} : { onSelectMapping: onSelectProvider })}
      {...(onSetDefaultProvider === undefined ? {} : { onSetDefault: onSetDefaultProvider })}
      {...(onSetPreferredChapterSource === undefined
        ? {}
        : { onSetPreferred: onSetPreferredChapterSource })}
      {...(onRequestUnmerge === undefined ? {} : { onUnmergeMapping: onRequestUnmerge })}
    />
  );
}

function MangaChaptersSection({
  view,
  isPending,
  isLoading,
  loadError,
  onOpenChapter,
  onRetryLoad,
  onSetChapterRead,
  onMarkPreviousChaptersRead,
}: {
  readonly view: MangaDetailView;
  readonly isPending: boolean;
  readonly isLoading: boolean;
  readonly loadError: string | undefined;
  onOpenChapter: (chapterId: ChapterId) => void;
  onRetryLoad: (() => void) | undefined;
  onSetChapterRead: ((chapterId: ChapterId, read: boolean) => Promise<void> | void) | undefined;
  onMarkPreviousChaptersRead: ((chapterId: ChapterId) => Promise<void> | void) | undefined;
}) {
  const { data, activeMappingId } = view;
  const lastReadChapterId = data.libraryEntry?.lastReadChapterId;

  return (
    <MangaChapterList
      chapters={data.chapters}
      {...(data.readStates === undefined ? {} : { readStates: data.readStates })}
      {...(data.downloadedChapterIds === undefined
        ? {}
        : { downloadedChapterIds: data.downloadedChapterIds })}
      {...(activeMappingId === undefined ? {} : { mappingId: activeMappingId })}
      {...(lastReadChapterId === undefined ? {} : { lastReadChapterId })}
      isPending={isPending}
      isLoading={isLoading}
      {...(loadError === undefined ? {} : { loadError })}
      onOpenChapter={onOpenChapter}
      {...(onRetryLoad === undefined ? {} : { onRetryLoad })}
      {...(onSetChapterRead === undefined ? {} : { onSetChapterRead })}
      {...(onMarkPreviousChaptersRead === undefined
        ? {}
        : { onMarkPreviousRead: onMarkPreviousChaptersRead })}
    />
  );
}

function MangaRelatedSections({
  recommendations,
  relatedTitles,
  onOpenRelatedManga,
}: {
  readonly recommendations: MangaDetailRelatedState | undefined;
  readonly relatedTitles: MangaDetailRelatedState | undefined;
  onOpenRelatedManga: ((mangaId: MangaId) => void) | undefined;
}) {
  const openManga = onOpenRelatedManga ?? (() => {});
  return (
    <>
      {recommendations === undefined ? null : (
        <MangaRelatedTitles
          heading="Recommendations"
          {...recommendations}
          onOpenManga={openManga}
        />
      )}
      {relatedTitles === undefined ? null : (
        <MangaRelatedTitles heading="Related titles" {...relatedTitles} onOpenManga={openManga} />
      )}
    </>
  );
}

interface DetailHostProps {
  readonly props: MangaDetailPageProps;
  readonly view: MangaDetailView;
}

function MangaHeaderHost({
  props,
  view,
  canSetCover,
  onOpenCover,
}: DetailHostProps & { readonly canSetCover: boolean; onOpenCover: () => void }) {
  return (
    <MangaDetailHeader
      view={view}
      providerLabels={props.providerLabels}
      isLibraryActionPending={props.isLibraryActionPending ?? false}
      isCoverActionPending={props.isCoverActionPending ?? false}
      onBack={props.onBack}
      onOpenChapter={props.onOpenChapter}
      onAddToLibrary={props.onAddToLibrary}
      onRemoveFromLibrary={props.onRemoveFromLibrary}
      onToggleFavorite={props.onToggleFavorite}
      onCategoriesChange={props.onCategoriesChange}
      onStatusChange={props.onStatusChange}
      onOpenMigration={props.onOpenMigration}
      onOpenProviderSettings={props.onOpenProviderSettings}
      onOpenReaderSettings={props.onOpenReaderSettings}
      onOpenCover={canSetCover ? onOpenCover : undefined}
    />
  );
}

function MangaProvidersHost({
  props,
  view,
  selectProvider,
  canUnmerge,
  onRequestUnmerge,
}: DetailHostProps & {
  selectProvider: (mappingId: ProviderMappingId) => Promise<void>;
  readonly canUnmerge: boolean;
  onRequestUnmerge: (mappingId: ProviderMappingId) => void;
}) {
  return (
    <MangaProvidersSection
      view={view}
      providerLabels={props.providerLabels}
      isPending={props.isProviderActionPending ?? false}
      onSelectProvider={props.onSelectProvider === undefined ? undefined : selectProvider}
      onSetDefaultProvider={props.onSetDefaultProvider}
      onSetPreferredChapterSource={props.onSetPreferredChapterSource}
      onRequestUnmerge={canUnmerge ? onRequestUnmerge : undefined}
    />
  );
}

function MangaChaptersHost({ props, view }: DetailHostProps) {
  return (
    <MangaChaptersSection
      view={view}
      isPending={props.isChapterActionPending ?? false}
      isLoading={props.isChaptersLoading ?? false}
      loadError={props.chaptersError}
      onOpenChapter={props.onOpenChapter}
      onRetryLoad={props.onRetryChapters}
      onSetChapterRead={props.onSetChapterRead}
      onMarkPreviousChaptersRead={props.onMarkPreviousChaptersRead}
    />
  );
}

function MangaDuplicatesHost({ props }: { readonly props: MangaDetailPageProps }) {
  return (
    <MangaDuplicatesSection
      currentMangaId={props.mangaId}
      {...(props.providerLabels === undefined ? {} : { providerLabels: props.providerLabels })}
      {...(props.duplicates === undefined ? {} : { state: props.duplicates })}
      isPending={props.isMergePending ?? false}
      {...(props.loadMergePreview === undefined ? {} : { loadPreview: props.loadMergePreview })}
      {...(props.onMerge === undefined ? {} : { onMerge: props.onMerge })}
      {...(props.onMerged === undefined ? {} : { onMerged: props.onMerged })}
    />
  );
}

function MangaDialogsHost({
  props,
  view,
  unmerge,
  coverDialogOpen,
  setCoverDialogOpen,
}: DetailHostProps & {
  unmerge: ReturnType<typeof useUnmergeRequest>;
  readonly coverDialogOpen: boolean;
  setCoverDialogOpen: (open: boolean) => void;
}) {
  const customCoverUrl = view.customCoverUrl;
  return (
    <>
      {props.onUnmerge === undefined ? null : (
        <MangaUnmergeDialog
          open={unmerge.openMappingId !== undefined}
          {...(unmerge.preview === undefined ? {} : { preview: unmerge.preview })}
          isLoading={unmerge.isLoading}
          {...(unmerge.error === undefined ? {} : { error: unmerge.error })}
          isPending={props.isUnmergePending ?? false}
          {...(props.providerLabels === undefined ? {} : { providerLabels: props.providerLabels })}
          onOpenChange={(open) => {
            if (!open) unmerge.reset();
          }}
          onConfirm={unmerge.confirm}
        />
      )}

      {props.onSetCoverImageUrl === undefined ? null : (
        <MangaCustomCoverDialog
          open={coverDialogOpen}
          {...(customCoverUrl === undefined ? {} : { initialUrl: customCoverUrl })}
          hasCustomCover={customCoverUrl !== undefined}
          isSaving={props.isCoverActionPending ?? false}
          onOpenChange={setCoverDialogOpen}
          onSave={async (url) => {
            await props.onSetCoverImageUrl?.(url);
            setCoverDialogOpen(false);
          }}
          onReset={async () => {
            await props.onSetCoverImageUrl?.(undefined);
            setCoverDialogOpen(false);
          }}
        />
      )}
    </>
  );
}

function MangaDetailContent(props: MangaDetailPageProps & { readonly data: MangaDetailData }) {
  const [viewedMappingId, setViewedMappingId] = useState<ProviderMappingId | null>(null);
  // The optimistic view must not outlive the snapshot it was clicked against:
  // otherwise a later action that changes the active mapping (e.g. "Use for
  // chapters") keeps painting the old one. Reset during render on a new snapshot.
  const [viewedData, setViewedData] = useState(props.data);
  if (viewedData !== props.data) {
    setViewedData(props.data);
    setViewedMappingId(null);
  }
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);
  const unmerge = useUnmergeRequest({
    ...(props.loadUnmergePreview === undefined ? {} : { loadPreview: props.loadUnmergePreview }),
    ...(props.onUnmerge === undefined ? {} : { onUnmerge: props.onUnmerge }),
  });
  const view = buildMangaDetailView(props.data, viewedMappingId);

  const selectProvider = async (mappingId: ProviderMappingId): Promise<void> => {
    if (props.onSelectProvider === undefined) return;
    setViewedMappingId(mappingId);
    try {
      await props.onSelectProvider(mappingId);
    } catch (error) {
      setViewedMappingId(null);
      throw error;
    }
  };

  const canUnmerge = unmerge.isAvailable && view.data.manga.providerMappings.length > 1;

  return (
    <section aria-label="Manga details" className="flex flex-col gap-8 p-6">
      <MangaHeaderHost
        props={props}
        view={view}
        canSetCover={props.onSetCoverImageUrl !== undefined}
        onOpenCover={() => setCoverDialogOpen(true)}
      />
      <MangaProvidersHost
        props={props}
        view={view}
        selectProvider={selectProvider}
        canUnmerge={canUnmerge}
        onRequestUnmerge={(mappingId) => void unmerge.open(mappingId)}
      />
      <MangaChaptersHost props={props} view={view} />
      <MangaDuplicatesHost props={props} />
      <MangaRelatedSections
        recommendations={props.recommendations}
        relatedTitles={props.relatedTitles}
        onOpenRelatedManga={props.onOpenRelatedManga}
      />
      <MangaDialogsHost
        props={props}
        view={view}
        unmerge={unmerge}
        coverDialogOpen={coverDialogOpen}
        setCoverDialogOpen={setCoverDialogOpen}
      />
    </section>
  );
}

export function MangaDetailPage(props: MangaDetailPageProps) {
  if (props.isLoading) {
    return (
      <section aria-label="Manga details" className="p-6">
        <LoadingState type="detail" />
      </section>
    );
  }

  if (props.isError) {
    return (
      <section aria-label="Manga details" className="p-6">
        <ErrorState
          title="Could not load manga"
          message="Local data failed to load. Try again in a moment."
        />
      </section>
    );
  }

  if (props.data === undefined || props.data === null) {
    return (
      <section aria-label="Manga details" className="p-6">
        <EmptyState
          type="manga-not-found"
          {...(props.onBack === undefined
            ? {}
            : { action: { label: 'Back to library', onClick: props.onBack } })}
        />
      </section>
    );
  }

  return <MangaDetailContent {...props} data={props.data} />;
}
