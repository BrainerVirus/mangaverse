const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure web platform extensions are resolvable
config.resolver.sourceExts = [
	...new Set([...config.resolver.sourceExts, 'web.tsx', 'web.ts', 'web.jsx', 'web.js']),
];

// Allow serving .wasm files as static assets
config.resolver.assetExts = [...new Set([...(config.resolver.assetExts ?? []), 'wasm'])];

module.exports = withNativewind(config);
