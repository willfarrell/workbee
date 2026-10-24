// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
import { postMessageToAll, postMessageToFocused } from "./postMessage.js";
import { compileRoute, pick, resolveMiddlewares } from "./route.js";
import { strategyNetworkOnly, strategyPrecache } from "./strategies.js";

// nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
export const pathPattern = (pattern) => new RegExp(pattern);
// Frozen so consumers can't mutate the shared default shape. Nested objects
// are frozen too; route compilation always spreads (…defaultConfig, …user)
// into a fresh object, so freezing doesn't block normal use.
export const defaultConfig = Object.freeze({
	// global
	cachePrefix: "sw-",
	skipWaiting: true,
	passthrough: true,

	// installEvent
	// { ...Route, routes:Route[] }
	precache: Object.freeze({
		routes: Object.freeze([]), // path[]
		strategy: strategyPrecache,
		eventType: false,
		postMessage: postMessageToFocused,
	}),

	// activateEvent
	activate: Object.freeze({
		eventType: false,
		postMessage: postMessageToAll,
		// Extra cache-name prefixes activate may purge (e.g. ["sw-"] when
		// cachePrefix is versioned as "sw-2-"). Configured prefixes are implied.
		// Stryker disable next-line ArrayDeclaration: a seeded sentinel prefix only
		// widens the purge to caches named "Stryker was here…", which no test or
		// real origin has; the default is otherwise indistinguishable from [].
		purgePrefixes: Object.freeze([]),
	}),

	// fetchEvent
	// Route
	methods: Object.freeze([]),
	pathPattern: pathPattern(".*$"),
	strategy: strategyNetworkOnly,
	cacheName: "default",

	// Route[]
	routes: Object.freeze([]),
});

const assertArray = (field, value) => {
	if (value !== undefined && !Array.isArray(value)) {
		throw new TypeError(
			`compileConfig: \`${field}\` must be an array, received ${typeof value}`,
		);
	}
};

export const compileConfig = (config = {}) => {
	assertArray("routes", config.routes);
	assertArray("middlewares", config.middlewares);
	assertArray("activate.purgePrefixes", config.activate?.purgePrefixes);
	// precache.routes can be string[], {path}[], or a single string URL —
	// only the array forms need asserting.
	if (
		config.precache?.routes !== undefined &&
		typeof config.precache.routes !== "string"
	) {
		assertArray("precache.routes", config.precache.routes);
	}
	const baseConfig = resolveMiddlewares({ ...defaultConfig, ...config });
	baseConfig.routes = baseConfig.routes.map((r, i) => {
		// Path-only routes are sub-requests (strategyPartition), never matched;
		// anything else needs a RegExp or findRouteConfig throws on every fetch.
		if (!(r?.pathPattern instanceof RegExp) && !r?.path) {
			throw new TypeError(
				`compileConfig: routes[${i}].pathPattern must be a RegExp (use pathPattern("…"))`,
			);
		}
		return compileRoute(baseConfig, r);
	});
	// Resolved once at compile time: an unmatched request may bypass
	// `respondWith` (see eventFetch) only when the top-level config would do
	// nothing beyond proxying — the default network-only strategy with no
	// middlewares. Any custom strategy or middleware keeps full handling.
	baseConfig.passthrough =
		baseConfig.passthrough === true &&
		baseConfig.strategy === strategyNetworkOnly &&
		!baseConfig.middlewares?.length;

	const precacheConfig = resolveMiddlewares({
		...defaultConfig.precache,
		...pick(baseConfig, ["cachePrefix", "cacheName", "middlewares"]),
		...baseConfig.precache,
	});
	// A string URL is compiled by events.js after fetching + extract().
	if (Array.isArray(precacheConfig.routes)) {
		precacheConfig.routes = precacheConfig.routes.map((r) =>
			compileRoute(precacheConfig, r),
		);
	}
	baseConfig.precache = precacheConfig;
	baseConfig.activate = { ...defaultConfig.activate, ...config.activate };

	return baseConfig;
};
