// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
import { postMessageToAll, postMessageToFocused } from "./postMessage.js";
import { strategyNetworkFirst, strategyNetworkOnly } from "./strategies.js";

// nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
export const pathPattern = (pattern) => new RegExp(pattern);
export const defaultConfig = {
	// global
	cachePrefix: "sw-",
	skipWaiting: true,

	// installEvent
	// { ...Route, routes:Route[] }
	precache: {
		routes: [], // path[]
		strategy: strategyNetworkFirst,
		eventType: false,
		postMessage: postMessageToFocused,
	},

	// activateEvent
	activate: {
		eventType: false,
		postMessage: postMessageToAll,
	},

	// fetchEvent
	// Route
	methods: [],
	pathPattern: pathPattern(".*$"),
	strategy: strategyNetworkOnly,
	// requestMiddlware: [],
	// responseMiddleware: [],
	cacheName: "default",
	cacheControlMaxAge: -1, // -1 = disable

	// Route[]
	routes: [],
};

// strings
const before = "before";
const beforeNetwork = "beforeNetwork";
const afterNetwork = "afterNetwork";
const after = "after";
const cachePrefix = "cachePrefix";
const cacheName = "cacheName";
const methods = "methods";
const strategy = "strategy";
const middlewares = "middlewares";

const routeInheritKeys = [
	cachePrefix,
	cacheName,
	methods,
	strategy,
	middlewares,
];

const resolveMiddlewares = (cfg) => {
	cfg.cacheKey = cfg.cachePrefix + cfg.cacheName;
	cfg.before = flattenMiddleware(before, cfg);
	cfg.beforeNetwork = flattenMiddleware(beforeNetwork, cfg);
	cfg.afterNetwork = flattenMiddleware(afterNetwork, cfg).reverse();
	cfg.after = flattenMiddleware(after, cfg).reverse();
	return cfg;
};

export const compileRoute = (parent, raw) => {
	if (typeof raw === "string") raw = { path: raw };
	return resolveMiddlewares({ ...pick(parent, routeInheritKeys), ...raw });
};

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
		...pick(baseConfig, [cachePrefix, cacheName, middlewares]),
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

const pick = (originalObject = {}, keysToPick = []) => {
	const newObject = {};
	for (const path of keysToPick) {
		// only supports first level
		if (originalObject[path] !== undefined) {
			newObject[path] = originalObject[path];
		}
	}
	return newObject;
};

const flattenMiddleware = (type, routeConfig) =>
	(routeConfig.middlewares ?? [])
		.filter(Boolean)
		.map((middleware) => middleware[type])
		.filter(Boolean);
