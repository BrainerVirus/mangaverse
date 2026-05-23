import { PlatformInfo } from '@lib/platform';
import { downloadFile } from '@services/platform/filesystem';

type DownloadStatus = 'idle' | 'queued' | 'downloading' | 'complete' | 'error';

export interface DownloadTask {
	id: string;
	chapterId: string;
	url: string;
	filePath: string;
}

interface DownloadState {
	status: DownloadStatus;
	progress: number;
	message?: string;
}

const queue: DownloadTask[] = [];
let active = false;
const listeners = new Map<string, (state: DownloadState) => void>();

export function subscribeDownload(id: string, handler: (state: DownloadState) => void) {
	listeners.set(id, handler);
	return () => listeners.delete(id);
}

function emit(id: string, state: DownloadState) {
	listeners.get(id)?.(state);
}

export function enqueueDownload(task: DownloadTask) {
	queue.push(task);
	emit(task.id, { status: 'queued', progress: 0 });
	processQueue();
}

async function processQueue() {
	if (active) {
		return;
	}
	active = true;
	while (queue.length > 0) {
		const task = queue.shift();
		if (!task) {
			continue;
		}
		try {
			emit(task.id, { status: 'downloading', progress: 0 });

			if (PlatformInfo.isWeb) {
				await downloadFile(task.url, task.filePath);
			} else {
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				const FileSystem = require('expo-file-system');
				const download = FileSystem.createDownloadResumable(task.url, task.filePath);
				await download.downloadAsync();
			}

			emit(task.id, { status: 'complete', progress: 1 });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Download failed';
			emit(task.id, { status: 'error', progress: 0, message });
		}
	}
	active = false;
}
