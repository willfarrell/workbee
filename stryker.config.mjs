// Mutation testing. Coverage proves the tests EXECUTE the code; mutation testing
// proves the tests would FAIL if the code were wrong.
//
// One config, two modes:
//   npm run test:mutation                           mutate every package
//   MUTATE_PACKAGE=<pkg> npm run test:mutation      mutate just that package
//
// CI fans out per package via a matrix that sets MUTATE_PACKAGE.
const pkg = process.env.MUTATE_PACKAGE;
const base = pkg ? `packages/${pkg}` : "packages";

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
	packageManager: "npm",
	testRunner: "command",
	commandRunner: {
		command: `node --no-warnings=ExperimentalWarning --test --experimental-test-module-mocks ./${base}/**/*.test.js`,
	},
	coverageAnalysis: "off",
	// Scope the type-check-stripping preprocessor to JS only. Its default ("true")
	// parses every sandbox file and errors on the demo HTML partials (fragments
	// with no <html>/<body>); matching by extension skips them.
	disableTypeChecks: "**/*.js",
	mutate: [
		`${base}/**/*.js`,
		`!${base}/**/*.test.js`,
		`!${base}/**/*.perf.js`,
		`!${base}/**/*.fuzz.js`,
	],
	plugins: ["@stryker-mutator/*"],
	reporters: ["progress", "clear-text"],
	thresholds: { high: 100, low: 100, break: 100 },
	tempDirName: pkg ? `/tmp/stryker/@workbee/${pkg}` : "/tmp/stryker/@workbee",
};
