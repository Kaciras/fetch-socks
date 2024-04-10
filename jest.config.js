export default {
	coverageDirectory: "coverage",
	coverageProvider: "v8",
	preset: "ts-jest/presets/default-esm",
	clearMocks: true,
	testMatch: ["<rootDir>/index.spec.ts"],
};
