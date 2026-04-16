// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
/* global ReadableStream */

import { cacheExpired, cachePut, openCaches } from "./cache.js";
import { consoleError } from "./console.js";
import { fetchInlineStrategy } from "./events.js";
import {
	addHeaderToResponse,
	isResponse,
	newRequest,
	newResponse,
	urlRemoveHash,
} from "./http.js";

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

export const strategyCacheOnly = async (request, event, config) => {
	const cache = openCaches[config.cacheKey];
	if (!cache) return;
	return cache.match(request);
};

const cacheControlMaxAgeRegExp = /(max-age|s-maxage)=([0-9]+)/;
// const cacheControlStaleWhileRevalidateRegExp = /(stale-while-revalidate)=([0-9]+)/
export const strategyNetworkFirst = async (request, event, config) => {
	let response;
	try {
		response = await strategyNetworkOnly(request, event, config);
	} catch (e) {
		response = await strategyCacheOnly(request, event, config);

		// no cache value
		if (!response) {
			throw e;
		}
		return response;
	}
	if (response.ok) {
		// Add in Expires header to allow expiry of cache without complex logic
		const cacheControl = response.headers.get("Cache-Control");

		const match = cacheControl?.match(cacheControlMaxAgeRegExp);
		const maxAge = match ? Number.parseInt(match[2], 10) : 0;

		if (maxAge) {
			const responseTime = new Date(response.headers.get("Date")).getTime();
			response = addHeaderToResponse(
				response,
				"Expires",
				new Date(responseTime + maxAge * 1000).toString(),
			);

			event.waitUntil(cachePut(config.cacheKey, request, response.clone()));
		}
	}
	return response;
};

export const strategyCacheFirst = async (request, event, config) => {
	let response = await strategyCacheOnly(request, event, config);
	if (cacheExpired(response)) {
		// cache expired - spoof undefined to preserve cache in case of network failure
		response = undefined;
	}
	// cache undefined
	response ??= await strategyNetworkFirst(request, event, config);
	return response;
};

// Note: concurrent requests to the same stale URL will each trigger an
// independent background revalidation. This is a deliberate simplicity
// trade-off — deduplication would add complexity with minimal benefit since
// the cache is updated idempotently.
export const strategyStaleWhileRevalidate = async (request, event, config) => {
	let response = await strategyCacheOnly(request, event, config);
	if (cacheExpired(response)) {
		// cache expired, update in background
		event.waitUntil(
			strategyNetworkFirst(request, event, config).catch(consoleError),
		);
	}
	// cache undefined
	response ??= await strategyNetworkFirst(request, event, config);
	return response;
};

export const strategyIgnore = (request, event, config) => {
	return newResponse({ status: 408, url: request.url });
};

export const strategyCacheFirstIgnore = async (request, event, config) => {
	let response = await strategyCacheOnly(request, event, config);
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
