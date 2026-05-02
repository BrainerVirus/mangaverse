const PREFIX = 'mv_secure_';

export async function getItemAsync(key: string): Promise<string | null> {
	if (typeof localStorage === 'undefined') return null;
	return localStorage.getItem(`${PREFIX}${key}`);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(`${PREFIX}${key}`, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
	if (typeof localStorage === 'undefined') return;
	localStorage.removeItem(`${PREFIX}${key}`);
}
