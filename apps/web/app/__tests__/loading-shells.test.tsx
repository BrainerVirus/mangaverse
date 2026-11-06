/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getDefaultAppSettings, getDefaultReaderSettings } from '@app/shared';
import { AppSettingsPage } from '@/features/settings/components/AppSettingsPage';
import { ReaderSettingsPage } from '@/features/settings/components/ReaderSettingsPage';
import { BackupPage } from '@/features/backup/components/BackupPage';
import { StoragePage } from '@/features/storage/components/StoragePage';
import { DiagnosticsPage } from '@/features/diagnostics/components/DiagnosticsPage';
import { ThemeCustomizationPage } from '@/features/theme/components/ThemeCustomizationPage';
import { ThemeEditorLoading } from '@/features/theme/components/ThemeEditorPage';
import { OnboardingPage } from '@/features/onboarding/components/OnboardingPage';
import { DiscoverPage } from '@/features/search/components/DiscoverPage';
import { SearchPage } from '@/features/search/components/SearchPage';
import { MangaDetailPage } from '@/features/library/components/MangaDetailPage';

/**
 * The shell of a page: the frame and the section it opens, plus the heading and description.
 * A loading render that keeps all of it lands the header, spacing and width where the loaded
 * page draws them, so only the async region can move.
 */
function shellOf(container: HTMLElement) {
  const frame = container.querySelector('[data-page-container]');
  const section = frame?.querySelector('section');
  return {
    variant: frame?.getAttribute('data-page-container'),
    frameClass: frame?.className,
    sectionLabel: section?.getAttribute('aria-label'),
    sectionClass: section?.className,
    title: container.querySelector('h1')?.textContent,
    description: container.querySelector('[data-page-header] p')?.textContent,
  };
}

const noop = () => {};

describe('settings-style pages while their data loads', () => {
  it('App settings keeps its header and frame and loads only the sections', () => {
    const loading = render(
      <AppSettingsPage settings={undefined} isLoading isError={false} onChange={noop} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'App settings' })).toBeInTheDocument();
    expect(screen.getByText(/Global preferences for content/)).toBeInTheDocument();
    expect(loading.container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    const during = shellOf(loading.container);
    cleanup();

    const loaded = render(
      <AppSettingsPage
        settings={getDefaultAppSettings()}
        isLoading={false}
        isError={false}
        onChange={noop}
      />,
    );
    expect(shellOf(loaded.container)).toEqual(during);
  });

  it('Reader settings keeps its header and frame, and the title-scope reset action', () => {
    const titleScope = { onReset: noop };
    const loading = render(
      <ReaderSettingsPage
        settings={undefined}
        isLoading
        isError={false}
        onChange={noop}
        titleScope={titleScope}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Reader settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset title settings' })).toBeInTheDocument();
    const during = shellOf(loading.container);
    cleanup();

    const loaded = render(
      <ReaderSettingsPage
        settings={getDefaultReaderSettings()}
        isLoading={false}
        isError={false}
        onChange={noop}
        titleScope={titleScope}
      />,
    );
    expect(shellOf(loaded.container)).toEqual(during);
  });

  it('Backup keeps its header and frame while the sections load', () => {
    const props = {
      isError: false,
      onExport: noop,
      onSelectFile: noop,
      onRestore: noop,
      onClearPreview: noop,
      onDismissRestoreStatus: noop,
    };
    const loading = render(<BackupPage {...props} isLoading />);
    expect(screen.getByRole('heading', { level: 1, name: 'Backup & Restore' })).toBeInTheDocument();
    const during = shellOf(loading.container);
    cleanup();

    const loaded = render(<BackupPage {...props} isLoading={false} />);
    expect(shellOf(loaded.container)).toEqual(during);
  });

  it('Storage keeps its header with the refresh action present but disabled', () => {
    render(
      <StoragePage
        isLoading
        isError={false}
        summary={null}
        capabilities={{} as never}
        onRefresh={noop}
        onClear={noop}
        onRequestPersistentStorage={noop}
        onRetryDownload={noop}
        onRemoveDownload={noop}
        onDismissActionStatus={noop}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Storage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh storage' })).toBeDisabled();
  });

  it('Diagnostics keeps its header with refresh and copy present but disabled', () => {
    render(
      <DiagnosticsPage
        isLoading
        isError={false}
        report={null}
        capabilities={{} as never}
        onRefresh={noop}
        onCopyReport={noop}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Diagnostics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh diagnostics' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy report' })).toBeDisabled();
  });

  it('Theme keeps its heading and description while presets load', () => {
    render(
      <ThemeCustomizationPage settings={undefined} isLoading isError={false} onChange={noop} />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByText(/Choose a visual preset/)).toBeInTheDocument();
  });

  it('Theme editor keeps its heading and Cancel live (it only navigates); Duplicate and Save wait for the draft', () => {
    const onCancel = vi.fn<() => void>();
    render(<ThemeEditorLoading onCancel={onCancel} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Theme editor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save theme' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Onboarding keeps its step list, skip control and footer around the loading step', () => {
    render(
      <OnboardingPage
        state={undefined}
        themeSettings={undefined}
        appSettings={undefined}
        readerSettings={undefined}
        isLoading
        isError={false}
        onThemeChange={noop}
        onAppSettingsChange={noop}
        onReaderSettingsChange={noop}
        onSkip={noop}
        onBack={noop}
        onNext={noop}
        onInstallProvider={noop}
        onFinish={noop}
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Onboarding steps' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip setup' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});

describe('browse pages while their rows load', () => {
  const discoverProps = {
    selectedProviderId: null,
    expandedSection: null,
    isError: false,
    onSelectProvider: noop,
    onOpenManga: noop,
    onSeeAllSection: noop,
    onBackFromSection: noop,
  };

  it('Discover keeps its header and puts a tab strip and one row of six covers under it', () => {
    const { container } = render(<DiscoverPage {...discoverProps} data={undefined} isLoading />);

    expect(screen.getByRole('heading', { level: 1, name: 'Discover' })).toBeInTheDocument();
    expect(container.querySelector('[data-discover-loading]')).not.toBeNull();
    expect(container.querySelectorAll('[data-discover-loading] .aspect-3\\/4')).toHaveLength(6);
  });

  it('Discover’s placeholder row uses the columns of the section rows that replace it', () => {
    const { container: loading } = render(
      <DiscoverPage {...discoverProps} data={undefined} isLoading />,
    );
    const placeholderGrid = loading.querySelector('[data-discover-loading] .grid');
    const placeholderClass = placeholderGrid?.className;
    cleanup();

    const manga = {
      id: 'manga-1',
      canonicalTitle: 'One',
      alternativeTitles: [],
      authors: [],
      artists: [],
      tags: [],
      status: 'ongoing',
      contentRating: 'safe',
      providerMappings: [],
      defaultProviderMappingId: 'map-1',
      merged: false,
    } as never;
    const { container: loaded } = render(
      <DiscoverPage
        {...discoverProps}
        isLoading={false}
        data={{
          providers: [
            {
              providerId: 'p',
              providerName: 'Provider',
              sections: [
                { id: 'popular', title: 'Popular', capability: 'popular', results: [manga] },
              ],
            },
          ],
        }}
      />,
    );
    const sectionGrid = loaded.querySelector('[data-testid="discover-section-popular"]');

    expect(placeholderClass).toBeDefined();
    expect(sectionGrid?.className).toBe(placeholderClass);
  });

  it('Search with no query keeps its header and input and shows no placeholder to wait on', () => {
    const { container } = render(
      <SearchPage
        data={undefined}
        isLoading
        isError={false}
        viewState={{ query: '' }}
        onViewStateChange={noop}
        onOpenManga={noop}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search manga' })).toBeEnabled();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0);
  });

  it('Search with a query keeps its header and input and shows the results placeholder', () => {
    const { container } = render(
      <SearchPage
        data={undefined}
        isLoading
        isError={false}
        viewState={{ query: 'berserk' }}
        onViewStateChange={noop}
        onOpenManga={noop}
      />,
    );

    expect(screen.getByRole('searchbox', { name: 'Search manga' })).toHaveValue('berserk');
    expect(container.querySelectorAll('.aspect-3\\/4').length).toBeGreaterThan(0);
  });
});

describe('manga detail while the title loads', () => {
  it('keeps Back and the header’s boxes: a 3:4 cover, the summary lines and the chapter list', () => {
    const onBack = vi.fn<() => void>();
    const { container } = render(
      <MangaDetailPage
        mangaId={'manga-1' as never}
        data={undefined}
        isLoading
        isError={false}
        onBack={onBack}
        onOpenChapter={noop}
      />,
    );

    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    const header = container.querySelector('[data-detail-header]');
    expect(header?.querySelector('.aspect-3\\/4')).not.toBeNull();
    expect(header?.className).toContain('@5xl:flex-row');
    expect(screen.getByRole('region', { name: 'Manga details' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByText('Manga not found')).not.toBeInTheDocument();
  });
});
