// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
/* global ReadableStream */

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

export const strategyNetworkFirst = async (request, event, config) => {
	let response;
	try {
		response = await strategyNetworkOnly(request, event, config);
		if (response.ok) {
			response = applyExpires(response);
			if (response.headers.get("Expires")) {
				event.waitUntil(cachePut(config.cacheKey, request, response.clone()));
			}
		}
	} catch (e) {
		const cachedResponse = await cacheMatch(config.cacheKey, request);
		if (isResponse(cachedResponse)) {
			return cachedResponse;
		}
		response = e;
	}
	if (isResponse(response)) {
		return response;
	}
	throw response;
};

export const strategyStaleIfError = async (request, event, config) => {
	let response;
	try {
		response = await strategyNetworkOnly(request, event, config);
		if (response.ok) {
			response = applyExpires(response);
			if (response.headers.get("Expires")) {
				event.waitUntil(cachePut(config.cacheKey, request, response.clone()));
			}
		}
		if (500 <= response.status && response.status <= 599) {
			const cachedResponse = await cacheMatch(config.cacheKey, request);
			if (isResponse(cachedResponse)) {
				return cachedResponse;
			}
		}
	} catch (e) {
		const cachedResponse = await cacheMatch(config.cacheKey, request);
		if (isResponse(cachedResponse)) {
			return cachedResponse;
		}
		response = e;
	}
	if (isResponse(response)) {
		return response;
	}
	throw response;
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

export const strategyIgnore = async (request) => {
	return newResponse({ status: 504, url: request.url });
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

// { makeRequest, routes, strategy, headers, ... }
export const strategyPartition = (options = {}) => {
	return async (request, event, config) => {
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
		// in parallel while that resolves.
		let headers = options.headers;
		if (headers === undefined) {
			try {
				const first = await responses[0];
				headers = first.headers;
				responses[0] = Promise.resolve(first);
			} catch (e) {
				responses[0] = Promise.reject(e);
			}
		}

		const { body, streamDeferred } = streamResponses(responses, () =>
			abortController.abort(),
		);
		event.waitUntil(streamDeferred);
		return newResponse({ url: request.url, body }, headers);
	};
};

const streamResponses = (responses, onCancel) => {
	let body;
	const streamDeferred = new Promise((resolve, reject) => {
		body = new ReadableStream({
			async pull(controller) {
				try {
					if (responses.length) {
						const response = await responses.shift();
						const buffer = await response.arrayBuffer();
						controller.enqueue(new Uint8Array(buffer));
					} else {
						controller.close();
						resolve();
					}
				} catch (e) {
					controller.error(e);
					reject(e);
				}
			},
			cancel() {
				onCancel?.();
				resolve();
			},
		});
	});
	return { body, streamDeferred };
};
