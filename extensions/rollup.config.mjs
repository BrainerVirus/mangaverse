import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';

const makeConfig = (input, output) =>
	defineConfig({
		input,
		output: {
			file: output,
			format: 'cjs',
			exports: 'default',
		},
		plugins: [
			resolve(),
			typescript({
				tsconfig: './tsconfig.json',
				include: [input],
				compilerOptions: {
					noEmitOnError: false,
					outDir: 'extensions/dist',
					target: 'ES5',
					lib: ['ES2015', 'DOM'],
				},
			}),
		],
	});

export default [
	makeConfig('extensions/mangadex/index.ts', 'extensions/dist/mangadex.js'),
	makeConfig('extensions/tumangaonline/index.ts', 'extensions/dist/tumangaonline.js'),
];
