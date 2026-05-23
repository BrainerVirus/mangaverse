import { getAllKeys, getItem, removeItem, setItem } from './storage.web';

declare global {
	interface Window {
		showOpenFilePicker?: (opts: { types?: { accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle[]>;
		showSaveFilePicker?: (opts: { suggestedName?: string; types?: { accept: Record<string, string[]> }[] }) => Promise<FileSystemWritableFileStream>;
	}
}

interface FileSystemFileHandle {
	getFile(): Promise<{ text(): Promise<string>; name: string }>;
}

interface FileSystemWritableFileStream {
	write(data: string): Promise<void>;
	close(): Promise<void>;
	createWritable(): Promise<FileSystemWritableFileStream>;
}

const DOCUMENT_DIR = 'mangaverse/';

function normalizePath(path: string): string {
	return path.startsWith(DOCUMENT_DIR) ? path : `${DOCUMENT_DIR}${path}`;
}

export function getDocumentDir(): string {
	return DOCUMENT_DIR;
}

export async function readFile(path: string): Promise<string> {
	const key = normalizePath(path);
	const value = await getItem(key);
	if (value === null) {
		throw new Error(`File not found: ${key}`);
	}
	return value;
}

export async function writeFile(path: string, contents: string): Promise<void> {
	const key = normalizePath(path);
	await setItem(key, contents);
}

export async function deleteFile(path: string): Promise<void> {
	const key = normalizePath(path);
	await removeItem(key);
}

export async function fileExists(path: string): Promise<boolean> {
	const key = normalizePath(path);
	const value = await getItem(key);
	return value !== null;
}

export async function downloadFile(url: string, path: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
	}
	const text = await response.text();
	const key = normalizePath(path);
	await setItem(key, text);
	return key;
}

export async function ensureDir(path: string): Promise<string> {
	const dir = normalizePath(path);
	const allKeys = await getAllKeys();
	const exists = allKeys.some((k) => k.startsWith(dir));
	if (!exists) {
		await setItem(`${dir}.dir`, '');
	}
	return dir;
}

export async function pickAndReadFile(): Promise<{ content: string; name: string } | null> {
	if (typeof window === 'undefined' || !window.showOpenFilePicker) {
		return null;
	}
	try {
		const [handle] = await window.showOpenFilePicker({
			types: [{ accept: { 'application/json': ['.json'] } }],
		});
		const file = await handle.getFile();
		const content = await file.text();
		return { content, name: file.name };
	} catch {
		return null;
	}
}

export async function saveAndWriteFile(data: string, suggestedName: string): Promise<boolean> {
	if (typeof window === 'undefined') {
		return false;
	}
	if (!window.showSaveFilePicker) {
		const blob = new Blob([data], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = suggestedName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		return true;
	}
	try {
		const handle = await window.showSaveFilePicker({
			suggestedName,
			types: [{ accept: { 'application/json': ['.json'] } }],
		});
		const writable = await handle.createWritable();
		await writable.write(data);
		await writable.close();
		return true;
	} catch {
		return false;
	}
}
