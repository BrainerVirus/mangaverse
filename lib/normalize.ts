export function normalizeTitle(value: string) {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-zA-Z0-9]+/g, ' ')
		.trim()
		.toLowerCase();
}
