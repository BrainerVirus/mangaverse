import { PlatformInfo } from '@lib/platform';

export async function openDatabase(name: string) {
	if (PlatformInfo.isWeb) {
		const web = await import('./database.web');
		return web.openDatabase(name);
	}
	const native = await import('./database.native');
	return native.openDatabase(name);
}
