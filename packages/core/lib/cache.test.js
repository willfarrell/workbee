/* global Response Headers */

import { equal, strictEqual } from "node:assert";
import { mock, test } from "node:test";
import "../../../fixtures/helper.js";
import {
	applyExpires,
	cacheControlMaxAgeRegExp,
	cacheDeleteExpired,
	cacheExpired,
	cacheMatch,
	cachePut,
	openCaches,
} from "../index.js";

test("cache", async (t) => {
	// *** cacheControlMaxAgeRegExp *** //
	await t.test(
		"cacheControlMaxAgeRegExp: captures the directive name and full multi-digit value",
		() => {
			// `[0-9]+` (one-or-more) must capture every digit, not just the first,
			// and must capture digits (not non-digits).
			const match = "max-age=86400".match(cacheControlMaxAgeRegExp);
			equal(match[1], "max-age");
			equal(match[2], "86400");

			const sMatch = "s-maxage=120".match(cacheControlMaxAgeRegExp);
			equal(sMatch[1], "s-maxage");
			equal(sMatch[2], "120");
		},
	);

	// *** cacheExpired *** //
	await t.test(
		"cacheExpired: should return undefined for falsy response",
		async () => {
			strictEqual(cacheExpired(undefined), undefined);
			strictEqual(cacheExpired(null), undefined);
			strictEqual(cacheExpired(false), undefined);
		},
	);

	await t.test(
		"cacheExpired: should return true for expired response",
		async () => {
			const pastDate = new Date(Date.now() - 86400 * 1000).toString();
			const response = new Response("", {
				headers: new Headers({ Expires: pastDate }),
			});
			strictEqual(cacheExpired(response), true);
		},
	);

	await t.test(
		"cacheExpired: should return false for non-expired response",
		async () => {
			const futureDate = new Date(Date.now() + 86400 * 1000).toString();
			const response = new Response("", {
				headers: new Headers({ Expires: futureDate }),
			});
			strictEqual(cacheExpired(response), false);
		},
	);

	await t.test(
		"cacheExpired: should return false when no Expires header",
		async () => {
			const response = new Response("", {
				headers: new Headers({}),
			});
			strictEqual(cacheExpired(response), false);
		},
	);

	await t.test(
		"cacheExpired: an entry expiring exactly now is NOT yet expired (strict <)",
		(tt) => {
			// Boundary: when Expires === now the entry is still fresh. `<` returns
			// false here; `<=` would wrongly report it as expired.
			const expires = "Thu, 01 Jan 2026 00:00:00 GMT";
			const now = new Date(expires).getTime();
			tt.mock.method(Date, "now", () => now);
			const response = new Response("", {
				headers: new Headers({ Expires: expires }),
			});
			strictEqual(cacheExpired(response), false);
		},
	);

	// *** cachePut *** //
	await t.test(
		"cachePut: should store response in cache via openCaches",
		async (tt) => {
			const putFn = mock.fn();
			openCaches["test-cache"] = { put: putFn };
			tt.after(() => delete openCaches["test-cache"]);

			const request = new Request("http://localhost:8080/test");
			const response = new Response("body", { status: 200 });

			await cachePut("test-cache", request, response);

			equal(putFn.mock.callCount(), 1);
			equal(putFn.mock.calls[0].arguments[0], "http://localhost:8080/test");
		},
	);

	// *** cacheDeleteExpired *** //
	await t.test(
		"cacheDeleteExpired: should delete expired entries",
		async () => {
			const pastDate = new Date(Date.now() - 86400 * 1000).toString();
			const futureDate = new Date(Date.now() + 86400 * 1000).toString();

			const expiredResponse = new Response("", {
				headers: new Headers({ Expires: pastDate }),
			});
			const validResponse = new Response("", {
				headers: new Headers({ Expires: futureDate }),
			});

			const expiredKey = new Request("http://localhost:8080/expired");
			const validKey = new Request("http://localhost:8080/valid");

			const deleteFn = mock.fn();
			const mockCache = {
				keys: () => Promise.resolve([expiredKey, validKey]),
				match: (req) =>
					Promise.resolve(req === expiredKey ? expiredResponse : validResponse),
				delete: deleteFn,
			};

			// Override caches.open to return our mock
			const originalOpen = globalThis.caches.open;
			globalThis.caches.open = () => Promise.resolve(mockCache);

			await cacheDeleteExpired("test-expired");

			equal(deleteFn.mock.callCount(), 1);
			equal(deleteFn.mock.calls[0].arguments[0], expiredKey);

			// Restore
			globalThis.caches.open = originalOpen;
		},
	);

	await t.test(
		"cacheDeleteExpired: should handle keys returning nullish",
		async () => {
			const deleteFn = mock.fn();
			// match must never be invoked when keys() is nullish: the `?? []`
			// fallback yields an empty list, so the loop body never runs.
			const matchFn = mock.fn(() => Promise.resolve(undefined));
			const mockCache = {
				keys: () => Promise.resolve(null),
				match: matchFn,
				delete: deleteFn,
			};

			const originalOpen = globalThis.caches.open;
			globalThis.caches.open = () => Promise.resolve(mockCache);

			await cacheDeleteExpired("test-null");

			equal(matchFn.mock.callCount(), 0);
			equal(deleteFn.mock.callCount(), 0);

			globalThis.caches.open = originalOpen;
		},
	);

	await t.test(
		"cacheDeleteExpired: should not delete non-expired entries",
		async () => {
			const futureDate = new Date(Date.now() + 86400 * 1000).toString();

			const validResponse = new Response("", {
				headers: new Headers({ Expires: futureDate }),
			});
			const validKey = new Request("http://localhost:8080/valid");

			const deleteFn = mock.fn();
			const mockCache = {
				keys: () => Promise.resolve([validKey]),
				match: () => Promise.resolve(validResponse),
				delete: deleteFn,
			};

			const originalOpen = globalThis.caches.open;
			globalThis.caches.open = () => Promise.resolve(mockCache);

			await cacheDeleteExpired("test-valid");

			equal(deleteFn.mock.callCount(), 0);

			// Restore
			globalThis.caches.open = originalOpen;
		},
	);

	await t.test(
		"cacheDeleteExpired: should delete expired entries keyed by request when response.url is empty",
		async () => {
			const pastDate = new Date(Date.now() - 86400 * 1000).toString();
			const futureDate = new Date(Date.now() + 86400 * 1000).toString();

			// Synthetic/redirected responses have an empty url; entries are keyed
			// by request.url, so purging must enumerate request keys.
			const expiredResponse = new Response("", {
				headers: new Headers({ Expires: pastDate }),
			});
			Object.defineProperty(expiredResponse, "url", { value: "" });

			const validResponse = new Response("", {
				headers: new Headers({ Expires: futureDate }),
			});
			Object.defineProperty(validResponse, "url", { value: "" });

			const expiredKey = new Request("http://localhost:8080/expired");
			const validKey = new Request("http://localhost:8080/valid");

			const deleteFn = mock.fn();
			const mockCache = {
				keys: () => Promise.resolve([expiredKey, validKey]),
				match: (req) =>
					Promise.resolve(req === expiredKey ? expiredResponse : validResponse),
				delete: deleteFn,
			};

			const originalOpen = globalThis.caches.open;
			globalThis.caches.open = () => Promise.resolve(mockCache);

			await cacheDeleteExpired("test-empty-url");

			equal(deleteFn.mock.callCount(), 1);
			equal(deleteFn.mock.calls[0].arguments[0], expiredKey);

			globalThis.caches.open = originalOpen;
		},
	);

	// *** Concurrent open race *** //
	await t.test("concurrent cachePut only opens the cache once", async (tt) => {
		const key = "race-cache";
		delete openCaches[key];
		const originalOpen = globalThis.caches.open;
		tt.after(() => {
			delete openCaches[key];
			globalThis.caches.open = originalOpen;
		});

		let openCount = 0;
		const putFn = mock.fn();
		globalThis.caches.open = () => {
			openCount += 1;
			return new Promise((resolve) =>
				setTimeout(() => resolve({ put: putFn }), 10),
			);
		};

		const req1 = new Request("http://localhost:8080/a");
		const req2 = new Request("http://localhost:8080/b");
		const res = new Response("body", { status: 200 });

		await Promise.all([cachePut(key, req1, res), cachePut(key, req2, res)]);

		strictEqual(openCount, 1);
		equal(putFn.mock.callCount(), 2);
	});

	// *** transient caches.open() rejection must not wedge future reads *** //
	await t.test(
		"getCache: a transient caches.open() rejection does not wedge subsequent calls",
		async (tt) => {
			const key = "transient-open-cache";
			delete openCaches[key];
			const originalOpen = globalThis.caches.open;
			const originalHas = globalThis.caches.has;
			tt.after(() => {
				delete openCaches[key];
				globalThis.caches.open = originalOpen;
				globalThis.caches.has = originalHas;
			});

			// openCaches is empty until a successful open, so caches.has must be
			// falsy for this key for getCache to attempt (re)opening each call.
			globalThis.caches.has = () => Promise.resolve(false);

			let openCount = 0;
			const matchFn = mock.fn(() => Promise.resolve(undefined));
			globalThis.caches.open = () => {
				openCount += 1;
				if (openCount === 1) {
					return Promise.reject(new Error("transient open failure"));
				}
				return Promise.resolve({ match: matchFn });
			};

			const request = new Request("http://localhost:8080/test");

			let firstError;
			try {
				await cacheMatch(key, request);
			} catch (e) {
				firstError = e;
			}
			strictEqual(firstError?.message, "transient open failure");

			// The second call must succeed rather than re-returning the cached
			// rejected promise from inFlightOpens.
			await cacheMatch(key, request);

			strictEqual(openCount, 2);
			equal(matchFn.mock.callCount(), 1);
		},
	);

	// *** cachePut with caches.open *** //
	await t.test(
		"cachePut: should open cache when not in openCaches",
		async (tt) => {
			const putFn = mock.fn();
			const mockCache = { put: putFn };

			const originalOpen = globalThis.caches.open;
			globalThis.caches.open = () => Promise.resolve(mockCache);
			delete openCaches["new-cache"];
			tt.after(() => {
				delete openCaches["new-cache"];
				globalThis.caches.open = originalOpen;
			});

			const request = new Request("http://localhost:8080/test");
			const response = new Response("body", { status: 200 });

			await cachePut("new-cache", request, response);

			equal(putFn.mock.callCount(), 1);
			equal(openCaches["new-cache"], mockCache);
		},
	);

	await t.test(
		"cachePut: reopens the cache when the cached reference is stale (caches.has === false)",
		async (tt) => {
			const stalePutFn = mock.fn(() => {
				throw new Error("should not be called");
			});
			openCaches["stale-cache"] = { put: stalePutFn };

			const freshPutFn = mock.fn();
			const freshCache = { put: freshPutFn };

			const originalHas = globalThis.caches.has;
			const originalOpen = globalThis.caches.open;
			globalThis.caches.has = () => Promise.resolve(false);
			globalThis.caches.open = () => Promise.resolve(freshCache);
			tt.after(() => {
				delete openCaches["stale-cache"];
				globalThis.caches.has = originalHas;
				globalThis.caches.open = originalOpen;
			});

			const request = new Request("http://localhost:8080/test");
			const response = new Response("body", { status: 200 });
			await cachePut("stale-cache", request, response);

			equal(stalePutFn.mock.callCount(), 0);
			equal(freshPutFn.mock.callCount(), 1);
			equal(openCaches["stale-cache"], freshCache);
		},
	);

	// *** cachePut QuotaExceededError retry *** //
	await t.test(
		"cachePut: should retry after QuotaExceededError by deleting expired from same cache",
		async (tt) => {
			let callCount = 0;
			const putFn = mock.fn(() => {
				callCount++;
				if (callCount === 1) {
					const err = new DOMException("quota exceeded", "QuotaExceededError");
					throw err;
				}
			});
			openCaches["quota-cache"] = { put: putFn };

			// retry 0 must purge expired entries from THIS cache. Seed one expired
			// entry so the same-cache purge has observable work to do.
			const pastDate = new Date(Date.now() - 86400 * 1000).toString();
			const expiredResponse = new Response("", {
				headers: new Headers({ Expires: pastDate }),
			});
			const expiredKey = new Request("http://localhost:8080/expired");
			const deleteFn = mock.fn();
			const openSpy = mock.fn(() =>
				Promise.resolve({
					keys: () => Promise.resolve([expiredKey]),
					match: () => Promise.resolve(expiredResponse),
					delete: deleteFn,
				}),
			);
			const originalOpen = globalThis.caches.open;
			globalThis.caches.open = openSpy;
			tt.after(() => {
				delete openCaches["quota-cache"];
				globalThis.caches.open = originalOpen;
			});

			const request = new Request("http://localhost:8080/test");
			const response = new Response("body", { status: 200 });

			await cachePut("quota-cache", request, response);

			equal(putFn.mock.callCount(), 2);
			// retry 0 ran cacheDeleteExpired("quota-cache"), purging the expired entry.
			equal(deleteFn.mock.callCount(), 1);
			equal(deleteFn.mock.calls[0].arguments[0], expiredKey);
		},
	);

	await t.test("cachePut: should throw non-QuotaExceededError", async (tt) => {
		const putFn = mock.fn(() => {
			throw new TypeError("some other error");
		});
		openCaches["error-cache"] = { put: putFn };
		// A non-Quota error must be logged and rethrown immediately — never
		// swallowed into the retry path.
		const errorSpy = tt.mock.method(console, "error", () => {});
		tt.after(() => delete openCaches["error-cache"]);

		const request = new Request("http://localhost:8080/test");
		const response = new Response("body", { status: 200 });

		let threw = false;
		try {
			await cachePut("error-cache", request, response);
		} catch (e) {
			threw = true;
			equal(e.name, "TypeError");
		}
		equal(threw, true);
		// Immediate failure: put is attempted exactly once (no quota-style retry)
		// and the error is surfaced via consoleError.
		equal(putFn.mock.callCount(), 1);
		equal(errorSpy.mock.callCount(), 1);
		equal(errorSpy.mock.calls[0].arguments[0], "TypeError");
	});

	await t.test(
		"cachePut: should throw QuotaExceededError after final retry",
		async (tt) => {
			const putFn = mock.fn(() => {
				const err = new DOMException("quota exceeded", "QuotaExceededError");
				throw err;
			});
			openCaches["quota-cache-2"] = { put: putFn };

			const originalOpen = globalThis.caches.open;
			const originalKeys = globalThis.caches.keys;
			globalThis.caches.open = () =>
				Promise.resolve({
					keys: () => Promise.resolve([]),
					match: () => Promise.resolve(undefined),
					delete: mock.fn(),
				});
			const keysSpy = mock.fn(() => Promise.resolve([]));
			globalThis.caches.keys = keysSpy;
			tt.after(() => {
				delete openCaches["quota-cache-2"];
				globalThis.caches.open = originalOpen;
				globalThis.caches.keys = originalKeys;
			});

			const request = new Request("http://localhost:8080/test");
			const response = new Response("body", { status: 200 });

			let caught;
			try {
				await cachePut("quota-cache-2", request, response);
			} catch (e) {
				caught = e;
			}
			strictEqual(caught?.name, "QuotaExceededError");
			// initial + retry 0 (same-cache purge) + retry 1 (all-caches purge) = 3.
			equal(putFn.mock.callCount(), 3);
			// retry 1 ran cachesDeleteExpired(), which enumerates every cache via
			// caches.keys(); the same-cache purge (retry 0) never calls caches.keys.
			equal(keysSpy.mock.callCount(), 1);
		},
	);

	// *** cachesDeleteExpired *** //
	await t.test(
		"cachesDeleteExpired: should delete expired from all caches",
		async () => {
			const { cachesDeleteExpired } = await import("../index.js");

			const pastDate = new Date(Date.now() - 86400 * 1000).toString();
			const expiredResponse = new Response("", {
				headers: new Headers({ Expires: pastDate }),
			});
			const expiredKey = new Request("http://localhost:8080/expired");

			const deleteFn = mock.fn();
			const mockCache = {
				keys: () => Promise.resolve([expiredKey]),
				match: () => Promise.resolve(expiredResponse),
				delete: deleteFn,
			};

			const originalKeys = globalThis.caches.keys;
			const originalOpen = globalThis.caches.open;
			globalThis.caches.keys = () => Promise.resolve(["cache-a", "cache-b"]);
			globalThis.caches.open = () => Promise.resolve(mockCache);

			const settled = await cachesDeleteExpired();

			equal(deleteFn.mock.callCount(), 2);
			// One settled result per cache and no more — the accumulator starts
			// empty, so a seeded element would inflate this to 3.
			equal(settled.length, 2);

			globalThis.caches.keys = originalKeys;
			globalThis.caches.open = originalOpen;
		},
	);

	// *** cachesDelete *** //
	await t.test(
		"cachesDelete: should delete caches not in exclude list",
		async () => {
			const { cachesDelete } = await import("../index.js");

			const deletedKeys = [];
			const originalKeys = globalThis.caches.keys;
			const originalDelete = globalThis.caches.delete;
			globalThis.caches.keys = () =>
				Promise.resolve(["sw-default", "sw-api", "sw-old"]);
			globalThis.caches.delete = mock.fn((key) => {
				deletedKeys.push(key);
				return Promise.resolve(true);
			});

			await cachesDelete(["sw-default", "sw-api"]);

			equal(deletedKeys.length, 1);
			equal(deletedKeys[0], "sw-old");

			globalThis.caches.keys = originalKeys;
			globalThis.caches.delete = originalDelete;
		},
	);

	await t.test(
		"cachesDelete: should remove deleted keys from openCaches",
		async (tt) => {
			const { cachesDelete, openCaches } = await import("../index.js");

			openCaches["sw-keep"] = { fake: true };
			openCaches["sw-remove"] = { fake: true };

			const originalKeys = globalThis.caches.keys;
			const originalDelete = globalThis.caches.delete;
			globalThis.caches.keys = () => Promise.resolve(["sw-keep", "sw-remove"]);
			globalThis.caches.delete = mock.fn(() => Promise.resolve(true));
			tt.after(() => {
				delete openCaches["sw-keep"];
				delete openCaches["sw-remove"];
				globalThis.caches.keys = originalKeys;
				globalThis.caches.delete = originalDelete;
			});

			await cachesDelete(["sw-keep"]);

			equal(openCaches["sw-remove"], undefined);
			equal(openCaches["sw-keep"]?.fake, true);
		},
	);

	await t.test(
		"cachesDelete: should delete all caches when no exclude",
		async () => {
			const { cachesDelete } = await import("../index.js");

			const deletedKeys = [];
			const originalKeys = globalThis.caches.keys;
			const originalDelete = globalThis.caches.delete;
			// Include a key that matches a would-be seeded default ("Stryker was
			// here"): with the real empty default, EVERY cache must be deleted, so
			// this key is purged too. A non-empty default would wrongly preserve it.
			globalThis.caches.keys = () =>
				Promise.resolve(["Stryker was here", "sw-default", "sw-old"]);
			globalThis.caches.delete = mock.fn((key) => {
				deletedKeys.push(key);
				return Promise.resolve(true);
			});

			await cachesDelete();

			equal(deletedKeys.length, 3);
			strictEqual(deletedKeys.includes("Stryker was here"), true);

			globalThis.caches.keys = originalKeys;
			globalThis.caches.delete = originalDelete;
		},
	);

	// *** applyExpires *** //
	await t.test(
		"applyExpires: should add Expires header from Cache-Control max-age",
		async () => {
			const date = new Date().toString();
			const response = new Response("", {
				headers: new Headers({
					"Cache-Control": "max-age=60",
					Date: date,
				}),
			});

			const result = applyExpires(response);

			const expiresDate = new Date(result.headers.get("Expires")).getTime();
			const expected = new Date(date).getTime() + 60 * 1000;
			equal(expiresDate, expected);
		},
	);

	await t.test(
		"applyExpires: should return response unchanged when no Cache-Control header",
		async () => {
			const response = new Response("", {
				headers: new Headers({ Date: new Date().toString() }),
			});

			const result = applyExpires(response);

			strictEqual(result, response);
			strictEqual(result.headers.get("Expires"), null);
		},
	);

	await t.test(
		"applyExpires: should return response unchanged when max-age=0",
		async () => {
			const response = new Response("", {
				headers: new Headers({
					"Cache-Control": "max-age=0",
					Date: new Date().toString(),
				}),
			});

			const result = applyExpires(response);

			strictEqual(result, response);
			strictEqual(result.headers.get("Expires"), null);
		},
	);

	await t.test(
		"applyExpires: should return response unchanged when Cache-Control has no max-age",
		async () => {
			const response = new Response("", {
				headers: new Headers({
					"Cache-Control": "no-cache",
					Date: new Date().toString(),
				}),
			});

			const result = applyExpires(response);

			strictEqual(result, response);
			strictEqual(result.headers.get("Expires"), null);
		},
	);

	await t.test(
		"applyExpires: ignores max-age embedded inside a larger token (boundary-anchored)",
		async () => {
			// The directive matchers are anchored to ^ / comma / whitespace so
			// "max-age" inside a non-standard token like "x-max-age=60" (preceded by
			// a non-boundary "-") must NOT be treated as the real max-age directive.
			const response = new Response("", {
				headers: new Headers({
					"Cache-Control": "x-max-age=60",
					Date: new Date().toString(),
				}),
			});

			const result = applyExpires(response);

			strictEqual(result, response);
			strictEqual(result.headers.get("Expires"), null);
		},
	);

	await t.test(
		"applyExpires: matches max-age after a comma+space boundary",
		async () => {
			// A whitespace boundary must still match: "public, max-age=60" has a
			// space immediately before "max-age".
			const date = new Date().toString();
			const response = new Response("", {
				headers: new Headers({
					"Cache-Control": "public, max-age=60",
					Date: date,
				}),
			});

			const result = applyExpires(response);

			const expiresDate = new Date(result.headers.get("Expires")).getTime();
			equal(expiresDate, new Date(date).getTime() + 60 * 1000);
		},
	);

	await t.test(
		"applyExpires: should not overwrite an existing Expires header",
		async () => {
			const existingExpires = new Date(Date.now() + 123456).toString();
			const response = new Response("", {
				headers: new Headers({
					"Cache-Control": "max-age=60",
					Date: new Date().toString(),
					Expires: existingExpires,
				}),
			});

			const result = applyExpires(response);

			strictEqual(result, response);
			strictEqual(result.headers.get("Expires"), existingExpires);
		},
	);

	await t.test(
		"applyExpires: should fall back to Date.now() when Date header is unparseable",
		async () => {
			const before = Date.now();
			const response = new Response("", {
				headers: new Headers({
					"Cache-Control": "max-age=60",
					Date: "not-a-real-date",
				}),
			});

			const result = applyExpires(response);

			const expiresValue = result.headers.get("Expires");
			strictEqual(expiresValue === "Invalid Date", false);
			const expiresDate = new Date(expiresValue).getTime();
			strictEqual(Number.isFinite(expiresDate), true);
			strictEqual(expiresDate >= before + 60 * 1000 - 1000, true);
		},
	);

	await t.test(
		"applyExpires: should fall back to Date.now() when Date header missing",
		async () => {
			const before = Date.now();
			const response = new Response("", {
				headers: new Headers({ "Cache-Control": "max-age=60" }),
			});

			const result = applyExpires(response);

			const expiresDate = new Date(result.headers.get("Expires")).getTime();
			const after = Date.now();
			// Date.toString() drops milliseconds, allow 1s slop.
			strictEqual(expiresDate >= before + 60 * 1000 - 1000, true);
			strictEqual(expiresDate <= after + 60 * 1000, true);
		},
	);

	await t.test(
		"applyExpires: should honor s-maxage the same as max-age",
		async () => {
			const date = new Date().toString();
			const response = new Response("", {
				headers: new Headers({
					"Cache-Control": "s-maxage=120",
					Date: date,
				}),
			});

			const result = applyExpires(response);

			const expiresDate = new Date(result.headers.get("Expires")).getTime();
			const expected = new Date(date).getTime() + 120 * 1000;
			equal(expiresDate, expected);
		},
	);

	await t.test(
		"applyExpires: prefers s-maxage over max-age when both are present (regardless of order)",
		async () => {
			const date = new Date().toString();

			// max-age listed first.
			const responseA = new Response("", {
				headers: new Headers({
					"Cache-Control": "max-age=60, s-maxage=120",
					Date: date,
				}),
			});
			const resultA = applyExpires(responseA);
			equal(
				new Date(resultA.headers.get("Expires")).getTime(),
				new Date(date).getTime() + 120 * 1000,
			);

			// s-maxage listed first (regex-alternation order must not matter).
			const responseB = new Response("", {
				headers: new Headers({
					"Cache-Control": "s-maxage=120, max-age=60",
					Date: date,
				}),
			});
			const resultB = applyExpires(responseB);
			equal(
				new Date(resultB.headers.get("Expires")).getTime(),
				new Date(date).getTime() + 120 * 1000,
			);
		},
	);

	await t.test(
		"applyExpires: writes Expires as an HTTP-date (GMT)",
		async () => {
			const response = new Response("", {
				headers: new Headers({
					"Cache-Control": "max-age=60",
					Date: new Date().toUTCString(),
				}),
			});

			const result = applyExpires(response);

			const expires = result.headers.get("Expires");
			strictEqual(/ GMT$/.test(expires), true);
			strictEqual(Number.isNaN(new Date(expires).getTime()), false);
		},
	);
});
