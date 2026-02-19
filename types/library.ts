export interface LibraryManga {
	id: string;
	title: string;
	coverUrl?: string;
	unreadCount: number;
	lastReadAt?: number;
}

export interface HistoryEntry {
	id: string;
	title: string;
	chapter: string;
	page: number;
	readAt: number;
	readAtLabel: string;
}
