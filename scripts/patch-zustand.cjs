// Patch Zustand middleware to remove import.meta.env references
// This is needed because Metro bundles Zustand without Babel transformation,
// and import.meta can only appear in ES modules, not regular scripts.

const fs = require('node:fs');
const path = require('node:path');

const zustandMiddlewarePath = path.resolve(__dirname, '../node_modules/zustand/esm/middleware.mjs');

if (fs.existsSync(zustandMiddlewarePath)) {
	let content = fs.readFileSync(zustandMiddlewarePath, 'utf-8');

	const original = '(import.meta.env ? import.meta.env.MODE : void 0) !== "production"';
	const replacement = "(process.env.NODE_ENV !== 'production')";

	if (content.includes(original)) {
		content = content.replaceAll(original, replacement);
		fs.writeFileSync(zustandMiddlewarePath, content, 'utf-8');
		console.log('[mangaverse] Patched zustand middleware: import.meta → process.env');
	} else {
		console.log('[mangaverse] Zustand middleware already patched');
	}
}
