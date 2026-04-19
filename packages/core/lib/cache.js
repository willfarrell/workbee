// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
/* global caches */

import { consoleError } from "./console.js";
import { findRouteConfig } from "./events.js";
import { addHeaderToResponse, newRequest, newResponse } from "./http.js";

export const cacheControlMaxAgeRegExp = /(max-age|s-maxage)=([0-9]+)/;
export const cacheControlStaleWhileRevalidateRegExp =
	/(stale-while-revalidate)=([0-9]+)/;
export const cacheControlStaleIfErrorRegExp = /(stale-if-error)=([0-9]+)/;

export const applyExpires = (response) => {
	if (response.headers.get("Expires")) return response;
	const match = response.headers
		.get("Cache-Control")
		?.match(cacheControlMaxAgeRegExp);
	const maxAge = match ? Number.parseInt(match[2], 10) : 0;
	if (!maxAge) return response;
	const responseTime = new Date(response.headers.get("Date")).getTime();
	return addHeaderToResponse(
		response,
		"Expires",
		new Date(responseTime + maxAge * 1000).toString(),
	);
};

export const openCaches = {};

export const cacheMatch = async (cacheKey, request) => {
	openCaches[cacheKey] ??= await caches.open(cacheKey);
	return openCaches[cacheKey].match(request);
};

export const cacheOverrideEvent = (config, { allowedOrigins } = {}) => {
	return (messageEvent) => {
		if (allowedOrigins) {
			const sourceUrl = messageEvent?.source?.url;
			if (!sourceUrl) return;
			const origin = new URL(sourceUrl).origin;
			if (!allowedOrigins.includes(origin)) return;
		}
		const data = messageEvent?.data ?? messageEvent;
		let { request, response } = data;
		if (typeof request === "string") {
			request = newRequest(request);
		}
		const routeConfig = findRouteConfig(config, request);
		if (typeof response === "string") {
			response = newResponse({ url: request.url, body: response });
		}
		return cachePut(routeConfig.cacheKey, request, response);
	};
};

export const cachePut = async (cacheKey, request, response, retry = 0) => {
	openCaches[cacheKey] ??= await caches.open(cacheKey);
	const cache = openCaches[cacheKey];
	try {
		await cache.put(request.url, response.clone());
		return;
	} catch (e) {
		if (e.name !== "QuotaExceededError") {
			consoleError(e.name, cacheKey, request, response);
			// TODO postMessage?
			throw e;
		}
	}
	if (retry === 0) {
		// Remove expired from same cacheKey
		await cacheDeleteExpired(cacheKey);
	} else if (retry === 1) {
		// Remove expired from all caches
		await cachesDeleteExpired();
	} else {
		return;
	}
	return cachePut(cacheKey, request, response, retry + 1);
};

// Checks the Expires header only. Cache-Control max-age is converted to an
// Expires header by strategyNetworkFirst before caching, so this covers
// all responses that flow through the standard strategies.
export const cacheExpired = (response) => {
	if (!response) return;
	const expires = response.headers.get("Expires");
	if (!expires) return false;
	const expiresDate = new Date(expires).getTime();
	const nowDate = Date.now();
	return expiresDate < nowDate;
};

export const cacheDeleteExpired = async (cacheKey) => {
	const cache = await caches.open(cacheKey);
	const responses = await cache.matchAll();
	for (const response of responses ?? []) {
		if (cacheExpired(response)) {
			await cache.delete(response.url);
		}
	}
};

export const cachesDeleteExpired = async () => {
	const existingCacheKeys = await caches.keys();
	const cacheExpires = [];
	for (const cacheKey of existingCacheKeys) {
		cacheExpires.push(cacheDeleteExpired(cacheKey));
	}
	return Promise.allSettled(cacheExpires);
};

export const cachesDelete = async (exclude = []) => {
	const existingCacheKeys = await caches.keys();
	const validCacheSet = new Set(exclude);
	const toDelete = existingCacheKeys.filter(
		(existingCacheKey) => !validCacheSet.has(existingCacheKey),
	);
	const result = await Promise.all(toDelete.map(caches.delete.bind(caches)));
	for (const key of toDelete) {
		delete openCaches[key];
	}
	return result;
};
