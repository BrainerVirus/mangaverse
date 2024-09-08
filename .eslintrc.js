// https://docs.expo.dev/guides/using-eslint/
module.exports = {
	extends: ["expo", "prettier"],
	plugins: ["testing-library", "prettier"],
	rules: {
		"prettier/prettier": [
			"error",
			{
				endOfLine: "lf",
			},
		],
		"testing-library/await-async-queries": "error",
		"testing-library/no-await-sync-queries": "error",
		"testing-library/no-debugging-utils": "warn",
		"testing-library/no-dom-import": "off",
	},
}
