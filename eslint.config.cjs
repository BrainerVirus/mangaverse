const expoConfig = require("eslint-config-expo/flat")
const prettier = require("eslint-plugin-prettier")
const testingLibrary = require("eslint-plugin-testing-library")

module.exports = [
	...expoConfig,
	{
		plugins: {
			prettier,
			"testing-library": testingLibrary,
		},
		rules: {
			"prettier/prettier": ["error", { endOfLine: "lf" }],
			"testing-library/await-async-queries": "error",
			"testing-library/no-await-sync-queries": "error",
			"testing-library/no-debugging-utils": "warn",
			"testing-library/no-dom-import": "off",
		},
	},
]
