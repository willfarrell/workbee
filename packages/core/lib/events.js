// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
/* global skipWaiting clients BroadcastChannel */
import { cachePut, cachesDelete } from "./cache.js";
import { consoleError } from "./console.js";
import { isRequest, newRequest, newResponse } from "./http.js";
import { compileRoute } from "./route.js";

export const eventInstall = (event, config) => {
	event.waitUntil(eventInstallWaitUntil(event, config));
	if (config.skipWaiting !== false) {
		skipWaiting();
	}
};

const eventInstallWaitUntil = async (event, config) => {
	let {
		routes,
		postMessage,
		extract = precacheExtractJSON,
		eventType,
	} = config.precache;
	// Use and external config
	if (typeof routes === "string") {
		const sourceUrl = routes;
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
	await Promise.all(
		routes.map((routeConfig) =>
			fetchInlineStrategy(newRequest(routeConfig.path), event, routeConfig),
		),
	);

	if (eventType) {
		await postMessage({ type: eventType });
	}
};

// TODO move to plugin package
export const precacheExtractJSON = async (response) => {
	const rawContentType = response.headers.get("Content-Type");
	// Stryker disable next-line StringLiteral: this `?? ""` fallback is only used
	// when the Content-Type header is absent. The fallback string is fed straight
	// into `.startsWith("application/json")`, which is false for "" and for any
	// other non-JSON literal (e.g. Stryker's sentinel) alike, so the function
	// returns [] either way — no observable difference. (The "Content-Type" arg
	// mutation lives on the line above and is killed by the parse-success tests.)
	const contentType = rawContentType ?? "";
	if (
		!contentType
			.split(";")[0]
			.trim()
			.toLowerCase()
			.startsWith("application/json")
	)
		return [];
	const parsed = await response.json();
	if (!Array.isArray(parsed)) {
		throw new TypeError(
			"precacheExtractJSON: expected an array of routes, received " +
				(parsed === null ? "null" : typeof parsed),
		);
	}
	return parsed;
};

export const eventActivate = (event, config) => {
	event.waitUntil(eventActivateWaitUntil(event, config));
	event.waitUntil(clients.claim());
};

const eventActivateWaitUntil = async (_event, config) => {
	const exclude = new Set([config.cacheKey, config.precache.cacheKey]);
	const precacheRoutes = Array.isArray(config.precache.routes)
		? config.precache.routes
		: // Stryker disable next-line ArrayDeclaration: this fallback feeds
			// `precacheRoutes.concat(config.routes)` then `exclude.add(rc.cacheKey)`.
			// A seeded sentinel string has `.cacheKey === undefined`, so the loop
			// only adds `undefined` to the exclude Set — and since no CacheStorage
			// key is ever `undefined`, cachesDelete behaves identically. Equivalent.
			[];
	for (const routeConfig of precacheRoutes.concat(config.routes)) {
		exclude.add(routeConfig.cacheKey);
	}
	await cachesDelete([...exclude]);
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
		if (
			routeConfig.methods.includes(method) &&
			routeConfig.pathPattern.test(url)
		) {
			return routeConfig;
		}
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
			"cacheOverrideEvent requires `allowedOrigins` (non-empty string[]) " +
				"to prevent cache poisoning from untrusted origins.",
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
		let { request, response } = messageEvent.data;
		if (typeof request === "string") {
			request = newRequest(request);
		}
		if (!isRequest(request)) return;
		const routeConfig = findRouteConfig(config, request);
		if (typeof response === "string") {
			response = newResponse({ body: response });
		}
		// Keep the worker alive until the write lands and swallow failures so a
		// rejected cache write never becomes an unhandled rejection. `waitUntil`
		// is only present on a real ExtendableMessageEvent; the optional call lets
		// the handler also be driven directly (e.g. awaited) without one.
		const promise = cachePut(routeConfig.cacheKey, request, response).catch(
			consoleError,
		);
		messageEvent.waitUntil?.(promise);
		return promise;
	};
};

export const backgroundFetchSuccessEvent = (event) => {
	event.waitUntil(backgroundFetchSuccessEventWaitUntil(event));
};

const backgroundFetchSuccessEventWaitUntil = async ({ registration }) => {
	const channel = new BroadcastChannel(registration.id);
	channel.postMessage({ stored: true });
	channel.close();
};

export const backgroundFetchFailEvent = (event) => {
	consoleError(event);
};
