import type { AppSettings, ReaderSettings } from '@app/shared';

export type { AppSettings, ReaderSettings };

export interface AppSettingsPageData {
  readonly settings: AppSettings;
}

export interface ReaderSettingsPageData {
  readonly settings: ReaderSettings;
}
