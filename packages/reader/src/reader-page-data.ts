import type { ChapterId, MangaId, ReaderSettings, ReaderSettingsOverride } from '@app/shared';
import type { ReaderChapter, ReaderEngineSettings } from './types.js';

export interface ReaderPageData {
  readonly chapter: ReaderChapter;
  readonly mangaId: MangaId;
  readonly chapterId: ChapterId;
  readonly providerId: string;
  /** Human-readable provider name for the reading surface, when one is installed. */
  readonly sourceName?: string | undefined;
  readonly initialPageIndex: number;
  /** True when the saved read state is completed; opening must not unmark it. */
  readonly initialCompleted?: boolean;
  /** The global settings with this title's choices applied; may hold `auto`. */
  readonly settings: ReaderSettings;
  /** The global row alone, for "All titles" changes made in the reader. */
  readonly globalSettings?: ReaderSettings;
  /** This title's own choices; a concrete mode here beats every Auto inference. */
  readonly titleOverrides?: ReaderSettingsOverride;
  /** Tag labels from the stored manga identity, read by Auto mode. */
  readonly titleTags?: readonly string[];
  /**
   * `settings` resolved without a viewport. The session re-resolves with the
   * viewport, so Auto layout follows orientation.
   */
  readonly engineSettings: ReaderEngineSettings;
  /**
   * This session's first decode chose the strip under Auto (spec R6). The
   * session resolves to the strip even when stored ordinary pages or a concrete
   * global mode would outvote it. Never set under a concrete title mode.
   */
  readonly autoStripDecision?: 'strip';
  readonly previousChapterId?: ChapterId | undefined;
  readonly nextChapterId?: ChapterId | undefined;
}
