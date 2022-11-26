module.exports = {
	root: true,
	extends: [
		"@kaciras/core",
		"@kaciras/typescript",
	],
	env: {
		node: true,
	},
	rules: {
		"@kaciras/import-group-sort": "warn",
	},
};
