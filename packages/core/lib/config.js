// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
import { postMessageToAll, postMessageToFocused } from "./postMessage.js";
import { compileRoute, pick, resolveMiddlewares } from "./route.js";
import { strategyNetworkFirst, strategyNetworkOnly } from "./strategies.js";

// nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
export const pathPattern = (pattern) => new RegExp(pattern);
// Frozen so consumers can't mutate the shared default shape. Nested objects
// are frozen too; route compilation always spreads (…defaultConfig, …user)
// into a fresh object, so freezing doesn't block normal use.
export const defaultConfig = Object.freeze({
	// global
	cachePrefix: "sw-",
	skipWaiting: true,

	// installEvent
	// { ...Route, routes:Route[] }
	precache: Object.freeze({
		routes: Object.freeze([]), // path[]
		strategy: strategyNetworkFirst,
		eventType: false,
		postMessage: postMessageToFocused,
	}),

	// activateEvent
	activate: Object.freeze({
		eventType: false,
		postMessage: postMessageToAll,
	}),

	// fetchEvent
	// Route
	methods: Object.freeze([]),
	pathPattern: pathPattern(".*$"),
	strategy: strategyNetworkOnly,
	// requestMiddlware: [],
	// responseMiddleware: [],
	cacheName: "default",
	cacheControlMaxAge: -1, // -1 = disable

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
	// precache.routes can be string[], {path}[], or a single string URL —
	// only the array forms need asserting.
	if (
		config.precache?.routes !== undefined &&
		typeof config.precache.routes !== "string"
	) {
		assertArray("precache.routes", config.precache.routes);
	}
	const baseConfig = resolveMiddlewares({ ...defaultConfig, ...config });
	baseConfig.routes = baseConfig.routes.map((r) => compileRoute(baseConfig, r));

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

	return baseConfig;
};
