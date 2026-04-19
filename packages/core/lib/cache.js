// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
/* global caches */

import { consoleError } from "./console.js";
import { addHeaderToResponse } from "./http.js";

export const cacheControlMaxAgeRegExp = /(max-age|s-maxage)=([0-9]+)/;

export const applyExpires = (response) => {
	if (response.headers.get("Expires")) return response;
	const match = response.headers
		.get("Cache-Control")
		?.match(cacheControlMaxAgeRegExp);
	const maxAge = match ? Number.parseInt(match[2], 10) : 0;
	if (!maxAge) return response;
	const dateHeader = response.headers.get("Date");
	const parsedDate = dateHeader ? new Date(dateHeader).getTime() : NaN;
	const responseTime = Number.isFinite(parsedDate) ? parsedDate : Date.now();
	return addHeaderToResponse(
		response,
		"Expires",
		new Date(responseTime + maxAge * 1000).toString(),
	);
};

export const openCaches = {};
const inFlightOpens = {};

const getCache = (cacheKey) => {
	if (openCaches[cacheKey]) return openCaches[cacheKey];
	inFlightOpens[cacheKey] ??= caches.open(cacheKey).then((cache) => {
		openCaches[cacheKey] = cache;
		delete inFlightOpens[cacheKey];
		return cache;
	});
	return inFlightOpens[cacheKey];
};

export const cacheMatch = async (cacheKey, request) => {
	const cache = await getCache(cacheKey);
	return cache.match(request);
};

export const cachePut = async (cacheKey, request, response, retry = 0) => {
	const cache = await getCache(cacheKey);
	let lastError;
	try {
		await cache.put(request.url, response.clone());
		return;
	} catch (e) {
		if (e.name !== "QuotaExceededError") {
			consoleError(e.name, cacheKey, request, response);
			throw e;
		}
		lastError = e;
	}
	if (retry === 0) {
		// Remove expired from same cacheKey
		await cacheDeleteExpired(cacheKey);
	} else if (retry === 1) {
		// Remove expired from all caches
		await cachesDeleteExpired();
	} else {
		throw lastError;
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
