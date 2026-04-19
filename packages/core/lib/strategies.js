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
	return response;
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
	} catch (_e) {
		response = await strategyCacheOnly(request, event, config);
		response ??= await strategyIgnore(request, event, config);
	}

	return response;
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
	} catch (e) {
		if (500 <= e.status && e.status <= 599) {
			response = await strategyCacheOnly(request, event, config);
		}
		response ??= await strategyIgnore(request, event, config);
	}

	return response;
};

export const strategyCacheFirst = async (request, event, config) => {
	let response = await strategyCacheOnly(request, event, config);
	if (cacheExpired(response)) {
		// Fall through to network. If the network fails, strategyNetworkFirst
		// will fall back to the still-cached (stale) response via cacheMatch.
		response = undefined;
	}
	response ??= await strategyNetworkFirst(request, event, config);
	return response;
};

export const strategyStaleWhileRevalidate = async (request, event, config) => {
	let response = await strategyCacheOnly(request, event, config);
	if (cacheExpired(response)) {
		// cache expired, update in background
		event.waitUntil(
			strategyNetworkFirst(request, event, config).catch(consoleError),
		);
	}
	response ??= await strategyNetworkFirst(request, event, config);
	return response;
};

export const strategyIgnore = (request, event, config) => {
	return newResponse({ status: 408, url: request.url });
};

export const strategyCacheFirstIgnore = async (request, event, config) => {
	let response = await cacheMatch(config.cacheKey, request);
	if (cacheExpired(response)) {
		response = undefined;
	}
	response ??= strategyIgnore(request, event, config);
	return response;
};

export const strategyStatic = (response) => {
	const strategyStatic = (request, event, config) => {
		// Allow response to be an error
		return isResponse(response) ? response.clone() : response;
	};
	return strategyStatic;
};

export const strategyHTMLPartition = (options = {}) => {
	options.makeRequest = (request, config, routeConfig) => {
		const url = urlRemoveHash(request.url).replace(
			config.pathPattern,
			routeConfig.path,
		);
		return newRequest(url, { ...request });
	};
	return strategyPartition(options);
};

// { makeRequest, routes, strategy, ... }
export const strategyPartition = (options = {}) => {
	return async (request, event, config) => {
		const responses = options.routes.map((routeConfig) => {
			let subRequest = request;
			if (options.makeRequest) {
				subRequest = options.makeRequest(request, config, routeConfig);
			}
			return fetchInlineStrategy(subRequest, event, routeConfig);
		});
		const { body, headers, streamDeferred } = streamResponses(responses);

		event.waitUntil(streamDeferred);

		return newResponse({ url: request.url, body }, headers);
	};
};

const streamResponses = (responses) => {
	let body, headers;
	const streamDeferred = new Promise((resolve, reject) => {
		body = new ReadableStream({
			async pull(controller) {
				try {
					if (responses.length) {
						const response = await responses.shift();
						headers ??= response.headers;
						const body = await response.arrayBuffer();
						controller.enqueue(new Uint8Array(body));
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
				resolve();
			},
		});
	});
	return { body, headers, streamDeferred };
};
