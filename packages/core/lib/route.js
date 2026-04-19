// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
// Route-compilation helpers shared by config.js (static compilation) and
// events.js (compilation of routes fetched at install-time). Kept free of
// strategy imports so neither caller pulls in strategies.js via this module.

const before = "before";
const beforeNetwork = "beforeNetwork";
const afterNetwork = "afterNetwork";
const after = "after";

export const routeInheritKeys = [
	"cachePrefix",
	"cacheName",
	"methods",
	"strategy",
	"middlewares",
];

export const pick = (originalObject = {}, keysToPick = []) => {
	const newObject = {};
	for (const path of keysToPick) {
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

export const resolveMiddlewares = (cfg) => {
	cfg.cacheKey = cfg.cachePrefix + cfg.cacheName;
	cfg.before = flattenMiddleware(before, cfg);
	cfg.beforeNetwork = flattenMiddleware(beforeNetwork, cfg);
	cfg.afterNetwork = flattenMiddleware(afterNetwork, cfg).reverse();
	cfg.after = flattenMiddleware(after, cfg).reverse();
	return cfg;
};

export const compileRoute = (parent, raw) => {
	if (typeof raw === "string") raw = { path: raw };
	const merged = resolveMiddlewares({
		...pick(parent, routeInheritKeys),
		...raw,
	});
	// A per-route empty `methods` would silently never match in findRouteConfig.
	// Default to GET so a bare `{ path }` Just Works.
	if (!merged.methods?.length) merged.methods = ["GET"];
	return merged;
};
