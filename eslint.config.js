import core from "@kaciras/eslint-config-core";
import typescript from "@kaciras/eslint-config-typescript";

export default [
	{
		ignores: ["index?(.spec).js"],
	},
	...core,
	...typescript,
	{
		rules: {
			"kaciras/import-group-sort": "warn",
			"prefer-const": ["error", {
				"destructuring": "all",
				"ignoreReadBeforeAssign": false,
			}],
		},
	},
];
