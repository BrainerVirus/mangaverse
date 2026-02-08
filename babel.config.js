module.exports = function (api) {
	api.cache(true)
	return {
		presets: ["babel-preset-expo"],
		plugins: [
			[
				"module-resolver",
				{
					alias: {
						"@app": "./app",
						"@assets": "./assets",
						"@components": "./components",
						"@constants": "./constants",
						"@lib": "./lib",
						"@services": "./services",
						"@stores": "./stores",
						"@types": "./types",
					},
				},
			],
		],
	}
}
