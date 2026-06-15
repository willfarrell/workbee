// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
/* global caches */

import { consoleError } from "./console.js";
import { addHeaderToResponse } from "./http.js";

// Literal per-directive matchers — boundary-anchored so "max-age" can't match
// inside another token, and literal (not `new RegExp(...)`) to avoid a dynamic-
// RegExp/ReDoS SAST finding. Only two directives exist, so no constructor needed.
const sMaxAgeRegExp = /(?:^|[,\s])s-maxage=([0-9]+)/;
const maxAgeRegExp = /(?:^|[,\s])max-age=([0-9]+)/;

export const applyExpires = (response) => {
	if (response.headers.get("Expires")) return response;
	const cacheControl = response.headers.get("Cache-Control");
	// Precedence: s-maxage is the shared-cache override (RFC 9111 §5.2.2.10), so
	// when both are present it wins regardless of order; max-age is the fallback.
	const match =
		cacheControl?.match(sMaxAgeRegExp) ?? cacheControl?.match(maxAgeRegExp);
	const maxAge = match ? Number.parseInt(match[1], 10) : 0;
	if (!maxAge) return response;
	const dateHeader = response.headers.get("Date");
	const parsedDate = dateHeader ? new Date(dateHeader).getTime() : NaN;
	const responseTime = Number.isFinite(parsedDate) ? parsedDate : Date.now();
	return addHeaderToResponse(
		response,
		"Expires",
		// HTTP-date format (RFC 9110 §5.6.7); `.toString()` is not a valid date.
		new Date(responseTime + maxAge * 1000).toUTCString(),
	);
};

export const openCaches = {};
const inFlightOpens = {};

const getCache = async (cacheKey) => {
	// A caller outside cachesDelete() may have dropped this cache from the
	// CacheStorage; detect the drift and reopen instead of handing back a
	// stale Cache reference whose writes land nowhere.
	if (openCaches[cacheKey] && (await caches.has(cacheKey))) {
		return openCaches[cacheKey];
	}
	delete openCaches[cacheKey];
	inFlightOpens[cacheKey] ??= caches
		.open(cacheKey)
		.then((cache) => {
			openCaches[cacheKey] = cache;
			delete inFlightOpens[cacheKey];
			return cache;
		})
		// Clear the in-flight slot on rejection too; otherwise a transient
		// caches.open() failure leaves a rejected promise cached here forever,
		// wedging every future read/write for this cacheKey.
		.catch((e) => {
			delete inFlightOpens[cacheKey];
			throw e;
		});
	return inFlightOpens[cacheKey];
};

export const cacheMatch = async (cacheKey, request) => {
	const cache = openCaches[cacheKey];
	if (cache) {
		// Reads sit on the response critical path, so validate the open handle
		// in parallel with the speculative read instead of paying a serial
		// `caches.has()` round-trip on every hit. The read result is only
		// returned when the cache still exists; otherwise fall through to
		// getCache(), which drops the stale handle and reopens.
		const [exists, response] = await Promise.all([
			caches.has(cacheKey),
			cache.match(request),
		]);
		if (exists) return response;
	}
	const freshCache = await getCache(cacheKey);
	return freshCache.match(request);
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
	// Enumerate request keys rather than response URLs: entries are written
	// with `cache.put(request.url, ...)`, and synthetic/redirected responses
	// have a `response.url` of "" or one that differs from the request key, so
	// `cache.delete(response.url)` would never purge them.
	const requests = await cache.keys();
	// Check (and purge) every entry concurrently; a serial match/delete pair
	// per entry makes quota recovery O(entries) round-trips.
	await Promise.all(
		(requests ?? []).map(async (request) => {
			const response = await cache.match(request);
			if (cacheExpired(response)) {
				await cache.delete(request);
			}
		}),
	);
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
