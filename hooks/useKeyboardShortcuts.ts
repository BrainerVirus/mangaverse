import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { PlatformInfo } from '@lib/platform';

type ShortcutAction =
	| 'search'
	| 'settings'
	| 'toggleSidebar'
	| 'toggleDarkMode'
	| 'refreshDiscover'
	| 'escape'
	| 'nextPage'
	| 'prevPage'
	| 'toggleFullscreen';

interface ShortcutHandlers {
	onSearch?: () => void;
	onSettings?: () => void;
	onToggleSidebar?: () => void;
	onToggleDarkMode?: () => void;
	onRefreshDiscover?: () => void;
	onEscape?: () => void;
	onNextPage?: () => void;
	onPrevPage?: () => void;
	onToggleFullscreen?: () => void;
}

const shortcutMap: Record<string, ShortcutAction> = {
	k: 'search',
	K: 'search',
	',': 'settings',
	b: 'toggleSidebar',
	B: 'toggleSidebar',
	d: 'toggleDarkMode',
	D: 'toggleDarkMode',
	r: 'refreshDiscover',
	R: 'refreshDiscover',
	Escape: 'escape',
	ArrowRight: 'nextPage',
	ArrowLeft: 'prevPage',
	' ': 'nextPage',
	f: 'toggleFullscreen',
	F: 'toggleFullscreen',
};

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
	const router = useRouter();

	useEffect(() => {
		if (!PlatformInfo.isWeb) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

			const isMeta = e.metaKey || e.ctrlKey;
			const action: ShortcutAction | undefined = isMeta ? shortcutMap[e.key] : shortcutMap[e.key];

			switch (action) {
				case 'search':
					e.preventDefault();
					if (handlers.onSearch) {
						handlers.onSearch();
					} else {
						router.push('/search');
					}
					break;
				case 'settings':
					e.preventDefault();
					if (handlers.onSettings) {
						handlers.onSettings();
					} else {
						router.push('/settings');
					}
					break;
				case 'toggleSidebar':
					e.preventDefault();
					handlers.onToggleSidebar?.();
					break;
				case 'toggleDarkMode':
					e.preventDefault();
					handlers.onToggleDarkMode?.();
					break;
				case 'refreshDiscover':
					e.preventDefault();
					handlers.onRefreshDiscover?.();
					break;
				case 'escape':
					handlers.onEscape?.();
					break;
				case 'nextPage':
					if (e.key === ' ' && isMeta) break;
					handlers.onNextPage?.();
					break;
				case 'prevPage':
					handlers.onPrevPage?.();
					break;
				case 'toggleFullscreen':
					handlers.onToggleFullscreen?.();
					break;
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [handlers, router]);
}

const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
	search: 'Cmd+K',
	settings: 'Cmd+,',
	toggleSidebar: 'Cmd+B',
	toggleDarkMode: 'Cmd+D',
	refreshDiscover: 'Cmd+R',
	escape: 'Esc',
	nextPage: '→ / Space',
	prevPage: '←',
	toggleFullscreen: 'F',
};

export function getShortcutLabel(action: ShortcutAction): string {
	return SHORTCUT_LABELS[action] ?? '';
}
