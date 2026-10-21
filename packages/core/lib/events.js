// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
/* global skipWaiting clients BroadcastChannel */
import { cachePut, cachesDelete } from "./cache.js";
import { cacheable } from "./cacheable.js";
import { consoleError } from "./console.js";
import { isRequest, isResponse, newRequest, newResponse } from "./http.js";
import { compileRoute } from "./route.js";

export const eventInstall = (event, config) => {
	event.waitUntil(eventInstallWaitUntil(event, config));
	if (config.skipWaiting !== false) {
		skipWaiting();
	}
};

const eventInstallWaitUntil = async (event, config) => {
	let { routes, postMessage, extract, eventType } = config.precache;
	// Use and external config
	if (typeof routes === "string") {
		const sourceUrl = routes;
		// The manifest format is an application concern, so core ships no default
		// parser — name the package that provides the common one rather than
		// failing later with "extract is not a function".
		if (typeof extract !== "function") {
			throw new TypeError(
				"precache: `extract` is required when `routes` is a URL. " +
					"Install @work-bee/precache-json and pass `extract: precacheExtractJSON`, " +
					"or supply your own (response) => Route[].",
			);
		}
		let response;
		try {
			response = await fetchInlineStrategy(
				newRequest(sourceUrl),
				event,
				config.precache,
			);
		} catch (e) {
			throw new Error(
				`precache: failed to fetch routes from "${sourceUrl}": ${e.message}`,
				{ cause: e },
			);
		}
		// fetchInlineStrategy returns Errors instead of throwing them; unwrap
		// so callers get a clear precache-specific failure message.
		if (response instanceof Error) {
			throw new Error(
				`precache: failed to fetch routes from "${sourceUrl}": ${response.message}`,
				{ cause: response },
			);
		}
		let extracted;
		try {
			extracted = await extract(response);
		} catch (e) {
			throw new Error(
				`precache: extract() threw for "${sourceUrl}": ${e.message}`,
				{ cause: e },
			);
		}
		// Externally-fetched routes may be plain {path} / strings; run them
		// through the same compilation pipeline as inline routes so each has
		// flattened middleware arrays and a cacheKey.
		routes = extracted.map((r) => compileRoute(config.precache, r));
		config.precache.routes = routes;
	}
	const responses = await Promise.all(
		routes.map((routeConfig) =>
			fetchInlineStrategy(newRequest(routeConfig.path), event, routeConfig),
		),
	);
	// Fail install on any missing asset: a resolved install lets activate purge
	// the previous version's caches while this one is incomplete.
	for (const [i, response] of responses.entries()) {
		if (!isResponse(response) || !response.ok) {
			throw new Error(
				`precache: failed to fetch "${routes[i].path}": ${isResponse(response) ? response.status : response}`,
				{ cause: response },
			);
		}
	}

	if (eventType) {
		await postMessage({ type: eventType });
	}
};

export const eventActivate = (event, config) => {
	event.waitUntil(eventActivateWaitUntil(event, config));
	event.waitUntil(clients.claim());
};

const eventActivateWaitUntil = async (_event, config) => {
	const exclude = new Set([config.cacheKey, config.precache.cacheKey]);
	// CacheStorage is origin-wide (page code, other SW scopes); only reap caches
	// under a prefix this config could have written.
	const prefixes = new Set([
		config.cachePrefix,
		config.precache.cachePrefix,
		...config.activate.purgePrefixes,
	]);
	const precacheRoutes = Array.isArray(config.precache.routes)
		? config.precache.routes
		: // Stryker disable next-line ArrayDeclaration: this fallback feeds
			// `routeConfigs` then `exclude.add(rc.cacheKey)`.
			// A seeded sentinel string has `.cacheKey === undefined`, so the loop
			// only adds `undefined` to the exclude Set — and since no CacheStorage
			// key is ever `undefined`, cachesDelete behaves identically. Equivalent.
			[];
	const routeConfigs = [config, ...precacheRoutes, ...config.routes];
	// for...of visits pushed entries too, so nested partitions are walked.
	for (const routeConfig of routeConfigs) {
		exclude.add(routeConfig.cacheKey);
		prefixes.add(routeConfig.cachePrefix);
		// strategyPartition sub-routes read and write their own caches.
		routeConfigs.push(...(routeConfig.strategy.routes ?? []));
	}
	await cachesDelete([...exclude], [...prefixes]);
	const { postMessage, eventType } = config.activate;
	if (eventType) {
		await postMessage({ type: eventType });
	}
};

export const eventFetch = (event, config) => {
	const routeConfig = findRouteConfig(config, event.request);
	// When no route matched and the top-level config is the bare network proxy
	// (default strategy, no middlewares), skip respondWith entirely so the
	// browser handles the request natively — this avoids piping every byte of
	// unmatched traffic through the worker. Opt out with `passthrough: false`.
	if (routeConfig === config && config.passthrough) return;
	event.respondWith(eventFetchRespondWith(event, routeConfig));
};

const eventFetchRespondWith = async (event, routeConfig) => {
	const result = await fetchStrategy(event.request, event, routeConfig);
	// fetchStrategy returns Response | Error; convert Error back to a rejection
	// so `respondWith` falls through to the browser's default handling instead
	// of silently breaking with a non-Response value.
	if (result instanceof Error) throw result;
	return result;
};

export const findRouteConfig = (config, request) => {
	const { method, url } = request;
	for (const routeConfig of config.routes) {
		const { pathPattern } = routeConfig;
		if (!pathPattern || !routeConfig.methods.includes(method)) continue;
		// A g/y pattern keeps lastIndex between calls; start every match fresh.
		pathPattern.lastIndex = 0;
		if (pathPattern.test(url)) return routeConfig;
	}
	return config;
};

export const fetchInlineStrategy = async (request, event, config) => {
	// process waitUntil inline due to being nested
	// Stryker disable next-line ArrayDeclaration: this accumulator is only ever
	// appended to (via the waitUntil closure) and then awaited with
	// `Promise.all(waitUntils)`. A seeded sentinel string is not a thenable, so
	// Promise.all treats it as already-resolved — same resolution timing, same
	// returned `response`, nothing reads the array's contents. Equivalent.
	const waitUntils = [];
	const waitUntil = (promise) => waitUntils.push(promise);
	// `Object.create(event, …)` preserves inherited accessor properties
	// (real FetchEvent exposes request/clientId/etc. via prototype accessors
	// that would be lost by `{ ...event }` spread).
	const inlineEvent = Object.create(event, {
		waitUntil: { value: waitUntil, enumerable: true },
	});
	const response = await fetchStrategy(request, inlineEvent, config);
	await Promise.all(waitUntils);
	return response;
};

export const fetchStrategy = async (request, event, config) => {
	config = { ...config };
	let response;
	let skipStrategy = false;
	try {
		for (const before of config.before) {
			request = await before(request, event, config);
		}
	} catch (e) {
		consoleError(e);
		response = e;
		skipStrategy = true;
	}
	if (!skipStrategy) {
		try {
			response = await config.strategy(request, event, config);
		} catch (e) {
			response = e;
		}
	}
	for (const after of config.after) {
		try {
			response = await after(request, response, event, config);
		} catch (e) {
			consoleError(e);
			response = e;
		}
	}
	return response;
};

export const cacheOverrideEvent = (config, { allowedOrigins } = {}) => {
	if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) {
		throw new Error(
			"cacheOverrideEvent requires `allowedOrigins` (non-empty string[]); a ServiceWorker only receives same-origin messages, so it does not stop script on your own origin from writing to the cache.",
		);
	}
	return (messageEvent) => {
		const sourceUrl = messageEvent?.source?.url;
		if (!sourceUrl) return;
		const origin = new URL(sourceUrl).origin;
		if (!allowedOrigins.includes(origin)) return;
		// Stryker disable next-line OptionalChaining: control only reaches here when
		// `sourceUrl` (= messageEvent?.source?.url) was truthy, which guarantees
		// messageEvent is non-null. So `messageEvent?.data` and `messageEvent.data`
		// are identical on every reachable path — the optional chain can't observe
		// a nullish messageEvent here. Equivalent.
		if (!messageEvent?.data) return;
		let { request, response, headers } = messageEvent.data;
		if (typeof request === "string") {
			request = newRequest(request);
		}
		if (!isRequest(request)) return;
		const routeConfig = findRouteConfig(config, request);
		// Built inside the async function so invalid posted headers (which
		// `new Headers()` throws on) are swallowed like any other failure.
		const store = async () => {
			if (typeof response === "string") {
				response = newResponse({ body: response }, headers);
			}
			return cachePut(routeConfig.cacheKey, request, response);
		};
		// Keep the worker alive until the write lands and swallow failures so a
		// rejected cache write never becomes an unhandled rejection. `waitUntil`
		// is only present on a real ExtendableMessageEvent; the optional call lets
		// the handler also be driven directly (e.g. awaited) without one.
		const promise = store().catch(consoleError);
		messageEvent.waitUntil?.(promise);
		return promise;
	};
};

export const backgroundFetchSuccessEvent = (event, config) => {
	event.waitUntil(backgroundFetchSuccessEventWaitUntil(event, config));
};

const backgroundFetchSuccessEventWaitUntil = async (
	{ registration },
	config,
) => {
	// The downloads only live on the registration until this event ends; copy
	// each into the cache of the route it would be served from.
	const records = await registration.matchAll();
	await Promise.all(
		records.map(async ({ request, responseReady }) => {
			const response = await responseReady;
			// Same filter as the strategies: cache.put rejects some of these, and
			// a credential Vary would be shared across users.
			if (!cacheable(request, response)) return;
			await cachePut(
				findRouteConfig(config, request).cacheKey,
				request,
				response,
			);
		}),
	);
	const channel = new BroadcastChannel(registration.id);
	channel.postMessage({ stored: true });
	channel.close();
};

export const backgroundFetchFailEvent = (event) => {
	consoleError(event);
};
