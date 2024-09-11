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
			"prefer-const": "off",
			"kaciras/import-specifier-order": "warn",
		},
	},
];
