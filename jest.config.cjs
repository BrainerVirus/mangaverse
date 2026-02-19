module.exports = {
	collectCoverageFrom: ['**/*.{ts,tsx,js,jsx}', '!**/*.d.ts', '!**/node_modules/**'],
	coveragePathIgnorePatterns: [
		'/node_modules/',
		'/coverage/',
		'/\.expo/',
		'/babel.config.js',
		'/metro.config.js',
		'/postcss.config.mjs',
		'/nativewind-env.d.ts',
		'/global.css',
		'/tailwind.config.js',
	],
	preset: 'jest-expo',
	transformIgnorePatterns: [
		'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))',
	],
};
