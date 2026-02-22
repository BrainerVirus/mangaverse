import { useEffect, useMemo, useState } from 'react';

import { useExtensionsStore } from '@stores/extensions';
import type { ProviderChapter, ProviderPage } from '../types/provider';

interface UseReaderDataOptions {
	chapterId: string;
	providerId: string;
	mangaId: string;
}

interface UseReaderDataResult {
	pages: ProviderPage[];
	chapters: ProviderChapter[];
	loading: boolean;
	error: string | null;
	nextChapter: ProviderChapter | null;
	prevChapter: ProviderChapter | null;
}

export function useReaderData({ chapterId, providerId, mangaId }: UseReaderDataOptions): UseReaderDataResult {
	const providers = useExtensionsStore((s) => s.providers);

	const [pages, setPages] = useState<ProviderPage[]>([]);
	const [chapters, setChapters] = useState<ProviderChapter[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const providerInstance = providers[providerId];
		if (!providerInstance || !chapterId) {
			setError('Provider not available');
			setLoading(false);
			return;
		}
		setLoading(true);
		setError(null);
		setPages([]);
		setChapters([]);

		Promise.all([
			providerInstance.getChapterPages(chapterId).catch((err) => {
				setError(err instanceof Error ? err.message : 'Failed to load');
				return [] as ProviderPage[];
			}),
			mangaId ? providerInstance.getChapterList(mangaId).catch(() => [] as ProviderChapter[]) : Promise.resolve([] as ProviderChapter[]),
		]).then(([pageData, chapterData]) => {
			setPages(pageData);
			setChapters(chapterData);
			setLoading(false);
		});
	}, [chapterId, providerId, providers, mangaId]);

	const currentChapterIdx = useMemo(() => chapters.findIndex((c) => c.id === chapterId), [chapters, chapterId]);
	const nextChapter = currentChapterIdx < chapters.length - 1 ? chapters[currentChapterIdx + 1] : null;
	const prevChapter = currentChapterIdx > 0 ? chapters[currentChapterIdx - 1] : null;

	return { pages, chapters, loading, error, nextChapter, prevChapter };
}
