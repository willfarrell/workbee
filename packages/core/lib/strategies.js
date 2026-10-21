// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
/* global ReadableStream Headers Request */

import { applyExpires, cacheExpired, cacheMatch, cachePut } from "./cache.js";
import { consoleError } from "./console.js";
import { fetchInlineStrategy } from "./events.js";
import { isResponse, newRequest, newResponse, urlRemoveHash } from "./http.js";

export const strategyNetworkOnly = async (request, event, config) => {
	for (const beforeNetwork of config.beforeNetwork) {
		request = await beforeNetwork(request, event, config);
	}
	let response;
	try {
		response = await fetch(request);
	} catch (e) {
		response = e;
	}
	for (const afterNetwork of config.afterNetwork) {
		response = await afterNetwork(request, response, event, config);
	}
	if (isResponse(response)) {
		return response;
	}
	throw response;
};

export const strategyCacheOnly = async (request, _event, config) => {
	const response = await cacheMatch(config.cacheKey, request);
	if (isResponse(response)) {
		return response;
	}
	throw response;
};

// A Vary on a credential can't be honoured: cachePut never stores credentials
// in the key, so an anonymous request would match the per-user entry.
const varyCredentialRegExp = /(?:^|[,\s])(?:authorization|cookie)(?:$|[,\s])/i;
// Token-boundary, case-insensitive Cache-Control directives (RFC 9111 §5.2).
const noStoreRegExp = /(?:^|[,\s])no-store(?:$|[,\s])/i;
const noCacheRegExp = /(?:^|[,\s])no-cache(?:$|[,\s=])/i;

// Only GET: entries are keyed as a GET of the URL, so a POST/HEAD response
// would be served to later GETs. cache.put() rejects partial content and
// `Vary: *` (header names can't contain "*", so a substring check is exact).
const cacheable = (request, response) => {
	// Stryker disable next-line StringLiteral: any fallback without "*" or a
	// credential token passes both checks below, exactly like "".
	const vary = response.headers.get("Vary") ?? "";
	return (
		request.method === "GET" &&
		response.ok &&
		response.status !== 206 &&
		!vary.includes("*") &&
		!varyCredentialRegExp.test(vary) &&
		!noStoreRegExp.test(response.headers.get("Cache-Control"))
	);
};

// Network, then store a copy when HTTP freshness allows it. `no-cache` means
// every use must revalidate, which a cache hit here never does.
const networkAndCache = async (request, event, config) => {
	let response = await strategyNetworkOnly(request, event, config);
	if (
		cacheable(request, response) &&
		!noCacheRegExp.test(response.headers.get("Cache-Control"))
	) {
		response = applyExpires(response);
		if (response.headers.get("Expires")) {
			// Clone EAGERLY, not inside cachePut: cachePut awaits caches.open() before
			// it clones, and by then the browser may already be streaming this
			// response to the page -- clone() throws on a disturbed body. The extra
			// tee is the price of that guarantee; do not "optimize" it away.
			event.waitUntil(cachePut(config.cacheKey, request, response.clone()));
		}
	}
	return response;
};

const cachedOrThrow = async (error, request, config) => {
	const cachedResponse = await cacheMatch(config.cacheKey, request);
	if (isResponse(cachedResponse)) return cachedResponse;
	throw error;
};

// Install-time default: always store. Precache freshness is owned by the SW
// version (cachePrefix), not by the asset's Cache-Control.
export const strategyPrecache = async (request, event, config) => {
	const response = await strategyNetworkOnly(request, event, config);
	if (cacheable(request, response)) {
		event.waitUntil(cachePut(config.cacheKey, request, response.clone()));
	}
	return response;
};

export const strategyNetworkFirst = async (request, event, config) => {
	try {
		return await networkAndCache(request, event, config);
	} catch (e) {
		return cachedOrThrow(e, request, config);
	}
};

export const strategyStaleIfError = async (request, event, config) => {
	let response;
	try {
		response = await networkAndCache(request, event, config);
	} catch (e) {
		return cachedOrThrow(e, request, config);
	}
	// Stryker disable next-line ConditionalExpression: `response` here always
	// comes from strategyNetworkOnly, which only ever returns a real Response
	// (it throws otherwise). A Response's status is constrained by the platform
	// to 200-599, so `response.status <= 599` is always true and the
	// `... && true` mutant is behaviourally identical — no constructible
	// Response can have status > 599 to distinguish it. The EqualityOperator
	// mutants on this line (500<=…, …<=599) remain enabled and are killed by
	// the status===500 and status===599 boundary tests.
	if (500 <= response.status && response.status <= 599) {
		const cachedResponse = await cacheMatch(config.cacheKey, request);
		if (isResponse(cachedResponse)) return cachedResponse;
	}
	return response;
};

export const strategyCacheFirst = async (request, event, config) => {
	let response = await cacheMatch(config.cacheKey, request);
	if (cacheExpired(response)) {
		// Fall through to network. If the network fails, strategyNetworkFirst
		// will fall back to the still-cached (stale) response via cacheMatch.
		response = undefined;
	}
	response ??= await strategyNetworkFirst(request, event, config);
	return response;
};

export const strategyStaleWhileRevalidate = async (request, event, config) => {
	let response = await cacheMatch(config.cacheKey, request);
	if (cacheExpired(response)) {
		// cache expired, update in background
		event.waitUntil(
			strategyNetworkFirst(request, event, config).catch(consoleError),
		);
	}
	response ??= await strategyNetworkFirst(request, event, config);
	return response;
};

export const strategyIgnore = async (_request, _event, _config) => {
	return newResponse({ status: 504 });
};

export const strategyCacheFirstIgnore = async (request, event, config) => {
	let response = await cacheMatch(config.cacheKey, request);
	if (cacheExpired(response)) {
		// Treat expired entries as a miss and fall through to strategyIgnore
		// (504) rather than re-fetching, since this strategy never reaches
		// the network.
		response = undefined;
	}
	response ??= await strategyIgnore(request, event, config);
	return response;
};

export const strategyStatic = (response) => {
	return async () => {
		if (isResponse(response)) return response.clone();
		throw response;
	};
};

export const strategyHTMLPartition = (options = {}) => {
	const makeRequest = (request, config, routeConfig) => {
		const url = urlRemoveHash(request.url).replace(
			config.pathPattern,
			routeConfig.path,
		);
		return newRequest(url, {
			method: request.method,
			headers: request.headers,
		});
	};
	return strategyPartition({ ...options, makeRequest });
};

// Headers that describe the individual fragment they arrived with rather than
// the concatenation of all of them. Inheriting these onto the composite would
// advertise the first fragment's length/validator/encoding for the whole
// stream — truncating it, mis-revalidating it, or telling the client to gunzip
// bytes `arrayBuffer()` already decoded.
const fragmentHeaders = [
	"content-length",
	"content-encoding",
	"content-range",
	"etag",
	"last-modified",
];

const compositeHeaders = (source) => {
	const headers = new Headers(source);
	for (const name of fragmentHeaders) {
		headers.delete(name);
	}
	return headers;
};

// { makeRequest, routes, strategy, headers, ... }
export const strategyPartition = (options = {}) => {
	const strategy = async (request, event, config) => {
		const abortController = new AbortController();
		const responses = options.routes.map((routeConfig) => {
			let subRequest = request;
			if (options.makeRequest) {
				subRequest = options.makeRequest(request, config, routeConfig);
			}
			subRequest = new Request(subRequest, { signal: abortController.signal });
			return fetchInlineStrategy(subRequest, event, routeConfig);
		});

		// If the caller supplied composite headers (fast path), return the
		// streaming Response immediately. Otherwise await the first sub-response
		// so its headers can seed the composite — other sub-requests continue
		// in parallel while that resolves. If the first sub-response rejects we
		// can't build a meaningful composite, so cancel the rest and surface
		// the error upfront instead of returning a 200-with-broken-stream.
		let headers = options.headers;
		let init = {};
		if (headers === undefined) {
			let first;
			try {
				first = await responses[0];
			} catch (e) {
				first = e;
			}
			// fetchInlineStrategy returns Errors instead of throwing them (after-
			// middleware can reshape errors into responses). Treat a non-Response
			// first sub-response as a hard failure for the composite.
			if (!isResponse(first)) {
				abortController.abort();
				for (const r of responses) r.catch(() => {});
				throw first instanceof Error ? first : new Error(String(first));
			}
			// Only strip when inheriting from a sub-response; `options.headers`
			// is the caller explicitly describing the composite.
			headers = compositeHeaders(first.headers);
			// Headers like Location or WWW-Authenticate only make sense with the
			// status they came with.
			init = { status: first.status, statusText: first.statusText };
			responses[0] = Promise.resolve(first);
		}

		const { body, streamDeferred } = streamResponses(responses, () =>
			abortController.abort(),
		);
		event.waitUntil(streamDeferred);
		return newResponse({ ...init, body }, headers);
	};
	// Exposed so eventActivate keeps the sub-routes' caches.
	strategy.routes = options.routes;
	return strategy;
};

const streamResponses = (responses, onCancel) => {
	let body;
	const streamDeferred = new Promise((resolve, reject) => {
		body = new ReadableStream({
			async pull(controller) {
				const fail = (error) => {
					// Stryker disable next-line OptionalChaining: streamResponses has a
					// single caller (strategyPartition) that always passes a non-nullish
					// onCancel (`() => abortController.abort()`), so `onCancel?.()` and
					// `onCancel()` are behaviourally identical here — onCancel is never
					// nullish on any reachable path.
					onCancel?.();
					for (const r of responses) r.catch(() => {});
					controller.error(error);
					reject(error);
				};
				try {
					if (responses.length) {
						const response = await responses.shift();
						if (!isResponse(response)) {
							fail(
								response instanceof Error
									? response
									: new Error(String(response)),
							);
							return;
						}
						const buffer = await response.arrayBuffer();
						controller.enqueue(new Uint8Array(buffer));
					} else {
						controller.close();
						resolve();
					}
				} catch (e) {
					fail(e);
				}
			},
			cancel() {
				// Stryker disable next-line OptionalChaining: see the fail() note above
				// — onCancel is always supplied by strategyPartition, so the optional
				// call is equivalent to a plain call on every reachable path.
				onCancel?.();
				resolve();
			},
		});
	});
	return { body, streamDeferred };
};
