// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
/* global caches Headers Request */

import { consoleError } from "./console.js";
import { addHeaderToResponse, deleteHeaderFromResponse } from "./http.js";

// Boundary-anchored so "max-age" can't match inside another token,
// case-insensitive as directives are (RFC 9111 §5.2), and literal
// (not `new RegExp(...)`) to avoid a dynamic-RegExp/ReDoS SAST finding.
// s-maxage is deliberately not read: it targets shared caches (RFC 9111
// §5.2.2.10) and a ServiceWorker cache is private.
const maxAgeRegExp = /(?:^|[,\s])max-age=([0-9]+)/i;

export const applyExpires = (response) => {
	const match = response.headers.get("Cache-Control")?.match(maxAgeRegExp);
	// No max-age: an existing Expires (if any) stands on its own.
	if (!match) return response;
	// Freshness left when it reached us (RFC 9111 §4.2.3): current age is the
	// larger of Age and the time since Date, never negative (origin clock skew).
	const now = Date.now();
	const age = (Number.parseInt(response.headers.get("Age"), 10) || 0) * 1000;
	const apparentAge = Math.max(
		0,
		// Missing/unparseable Date is NaN, so no apparent age.
		now - Date.parse(response.headers.get("Date")) || 0,
	);
	const freshness =
		Number.parseInt(match[1], 10) * 1000 - Math.max(apparentAge, age);
	// max-age overrides Expires (RFC 9111 §5.3), so an already-stale response
	// must not keep an Expires that would make it look fresh.
	if (freshness <= 0) {
		return response.headers.has("Expires")
			? deleteHeaderFromResponse(response, "Expires")
			: response;
	}
	return addHeaderToResponse(
		response,
		"Expires",
		// HTTP-date format (RFC 9110 §5.6.7); `.toString()` is not a valid date.
		new Date(now + freshness).toUTCString(),
	);
};

// `caches.match` with a cacheName resolves undefined for a missing cache
// instead of creating it, so reads need no open-handle bookkeeping.
export const cacheMatch = (cacheKey, request) =>
	caches.match(request, { cacheName: cacheKey });

const credentialHeaders = ["authorization", "cookie"];

// Entries are keyed by URL (a GET key even for other methods, which put()
// would reject), plus only the request headers the response Vary's on so the
// Vary check can match later. Credentials are never persisted in the key.
const cacheKeyRequest = (request, response) => {
	const vary = response.headers.get("Vary");
	if (!vary) return request.url;
	const headers = new Headers();
	for (const name of vary.split(",")) {
		const header = name.trim().toLowerCase();
		const value = request.headers.get(header);
		if (value !== null && !credentialHeaders.includes(header)) {
			headers.set(header, value);
		}
	}
	return new Request(request.url, { headers });
};

export const cachePut = async (cacheKey, request, response, retry = 0) => {
	const cache = await caches.open(cacheKey);
	let lastError;
	try {
		await cache.put(cacheKeyRequest(request, response), response.clone());
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
// Expires header by the network strategies before caching; strategyPrecache
// stores without Expires, so precached entries never expire.
export const cacheExpired = (response) => {
	if (!response) return;
	const expires = response.headers.get("Expires");
	if (!expires) return false;
	// Written as !(>=) so an unparseable date (NaN) counts as expired, as
	// RFC 9111 §5.3 requires for invalid values such as "0".
	return !(new Date(expires).getTime() >= Date.now());
};

export const cacheDeleteExpired = async (cacheKey) => {
	const cache = await caches.open(cacheKey);
	// Enumerate request keys rather than response URLs: entries are keyed by
	// cacheKeyRequest (a URL, or a Request carrying the Vary'd headers), and
	// synthetic/redirected responses have a `response.url` of "" or one that
	// differs from the key, so `cache.delete(response.url)` would miss them.
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

export const cachesDelete = async (exclude = [], prefixes = [""]) => {
	const existingCacheKeys = await caches.keys();
	const validCacheSet = new Set(exclude);
	const toDelete = existingCacheKeys.filter(
		(existingCacheKey) =>
			!validCacheSet.has(existingCacheKey) &&
			prefixes.some((prefix) => existingCacheKey.startsWith(prefix)),
	);
	return Promise.all(toDelete.map((key) => caches.delete(key)));
};
