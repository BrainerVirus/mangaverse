export interface InstalledExtension {
	id: string;
	name: string;
	version: string;
	icon?: string;
	languages: string[];
	nsfw: boolean;
	bundleUrl: string;
	minAppVersion?: string;
	localPath: string;
	enabled: boolean;
	order: number;
	installedAt: number;
	enabledLanguages: string[];
}
