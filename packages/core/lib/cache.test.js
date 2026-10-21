/* global Response Headers */

import { deepEqual, equal, strictEqual } from "node:assert";
import { mock, test } from "node:test";
import { cacheStore } from "../../../fixtures/helper.js";
import {
	applyExpires,
	cacheDeleteExpired,
	cacheExpired,
	cacheMatch,
	cachePut,
} from "../index.js";

test("cache", async (t) => {
	await t.test(
		"cachePut: keys by the request headers named in Vary, never credentials",
		async (tt) => {
			// A bare-URL key has no headers, so a `Vary: Accept` entry would never
			// match a real request again. Credentials are left out so they are not
			// persisted to disk as part of the stored request.
			const putFn = mock.fn();
			cacheStore["vary-cache"] = { put: putFn };
			tt.after(() => delete cacheStore["vary-cache"]);
			const request = new Request("http://localhost:8080/vary", {
				headers: {
					Accept: "text/html",
					"Accept-Language": "fr",
					Authorization: "Bearer secret",
					Cookie: "session=secret",
				},
			});
			await cachePut(
				"vary-cache",
				request,
				new Response("", {
					headers: { Vary: "accept, Authorization, Cookie, Origin" },
				}),
			);
			const key = putFn.mock.calls[0].arguments[0];
			equal(key.url, "http://localhost:8080/vary");
			deepEqual([...key.headers], [["accept", "text/html"]]);
		},
	);

	await t.test(
		"cacheMatch: returns the entry stored by cachePut, undefined otherwise",
		async (tt) => {
			tt.after(() => caches.delete("match-cache"));
			const request = new Request("http://localhost:8080/match");
			equal(await cacheMatch("match-cache", request), undefined);
			await cachePut("match-cache", request, new Response("stored"));
			equal(await (await cacheMatch("match-cache", request)).text(), "stored");
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
		"cachePut: should store response in cache via cacheStore",
		async (tt) => {
			const putFn = mock.fn();
			cacheStore["test-cache"] = { put: putFn };
			tt.after(() => delete cacheStore["test-cache"]);

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
	// *** cacheMatch fast path *** //
	// *** cachePut with caches.open *** //
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
			// retry 0 must purge expired entries from THIS cache. Seed one expired
			// entry so the same-cache purge has observable work to do.
			const pastDate = new Date(Date.now() - 86400 * 1000).toString();
			const expiredResponse = new Response("", {
				headers: new Headers({ Expires: pastDate }),
			});
			const expiredKey = new Request("http://localhost:8080/expired");
			const deleteFn = mock.fn();
			cacheStore["quota-cache"] = {
				put: putFn,
				keys: () => Promise.resolve([expiredKey]),
				match: () => Promise.resolve(expiredResponse),
				delete: deleteFn,
			};
			tt.after(() => {
				delete cacheStore["quota-cache"];
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
		cacheStore["error-cache"] = { put: putFn };
		// A non-Quota error must be logged and rethrown immediately — never
		// swallowed into the retry path.
		const errorSpy = tt.mock.method(console, "error", () => {});
		tt.after(() => delete cacheStore["error-cache"]);

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
			cacheStore["quota-cache-2"] = {
				put: putFn,
				keys: () => Promise.resolve([]),
				match: () => Promise.resolve(undefined),
				delete: mock.fn(),
			};

			const originalKeys = globalThis.caches.keys;
			const keysSpy = mock.fn(() => Promise.resolve([]));
			globalThis.caches.keys = keysSpy;
			tt.after(() => {
				delete cacheStore["quota-cache-2"];
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

	await t.test("applyExpires: reads max-age case-insensitively", async () => {
		// RFC 9111 §5.2: directive names are case-insensitive.
		const date = new Date().toUTCString();
		const result = applyExpires(
			new Response("", {
				headers: { "Cache-Control": "Public, Max-Age=60", Date: date },
			}),
		);
		equal(
			new Date(result.headers.get("Expires")).getTime(),
			new Date(date).getTime() + 60 * 1000,
		);
	});

	await t.test(
		"applyExpires: keeps an existing Expires header when there is no max-age",
		async () => {
			const existingExpires = new Date(Date.now() + 123456).toUTCString();
			const response = new Response("", {
				headers: new Headers({ Expires: existingExpires }),
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
		"applyExpires: ignores s-maxage (a ServiceWorker cache is a private cache)",
		async () => {
			// RFC 9111 §5.2.2.10: s-maxage only applies to shared caches. The
			// common CDN pattern `max-age=0, s-maxage=N` must not be browser-cached.
			for (const cacheControl of [
				"s-maxage=120",
				"max-age=0, s-maxage=86400",
				"s-maxage=86400, max-age=0",
			]) {
				const result = applyExpires(
					new Response("", { headers: { "Cache-Control": cacheControl } }),
				);
				equal(result.headers.get("Expires"), null, cacheControl);
			}
			const date = new Date().toUTCString();
			const result = applyExpires(
				new Response("", {
					headers: { "Cache-Control": "s-maxage=120, max-age=60", Date: date },
				}),
			);
			equal(
				new Date(result.headers.get("Expires")).getTime(),
				new Date(date).getTime() + 60 * 1000,
			);
		},
	);

	await t.test(
		"applyExpires: max-age overrides an existing Expires header",
		async () => {
			// RFC 9111 §5.3: with max-age present, Expires MUST be ignored.
			const date = new Date().toUTCString();
			const result = applyExpires(
				new Response("", {
					headers: {
						"Cache-Control": "max-age=3600",
						Expires: "Thu, 01 Jan 1970 00:00:00 GMT",
						Date: date,
					},
				}),
			);
			equal(
				new Date(result.headers.get("Expires")).getTime(),
				new Date(date).getTime() + 3600 * 1000,
			);
			equal(cacheExpired(result), false);
		},
	);

	await t.test(
		"applyExpires: a stale max-age drops a future Expires so it is not cached",
		async () => {
			const result = applyExpires(
				new Response("", {
					headers: {
						"Cache-Control": "max-age=0",
						Expires: new Date(Date.now() + 86400 * 1000).toUTCString(),
					},
				}),
			);
			equal(result.headers.get("Expires"), null);
		},
	);

	await t.test(
		"applyExpires: subtracts the Age header from max-age",
		async () => {
			const date = new Date().toUTCString();
			const result = applyExpires(
				new Response("", {
					headers: { "Cache-Control": "max-age=100", Age: "40", Date: date },
				}),
			);
			equal(
				new Date(result.headers.get("Expires")).getTime(),
				new Date(date).getTime() + 60 * 1000,
			);
			// Already stale by the time it arrived: not cacheable as fresh.
			const stale = applyExpires(
				new Response("", {
					headers: { "Cache-Control": "max-age=100", Age: "100", Date: date },
				}),
			);
			equal(stale.headers.get("Expires"), null);
		},
	);

	await t.test(
		"applyExpires: current age is max(now - Date, Age), counted from now",
		(tt) => {
			// RFC 9111 §4.2.3. Age already includes the time since Date, so the
			// two must not be added, and an origin clock ahead of ours must not
			// extend freshness.
			const now = new Date("Thu, 01 Jan 2026 00:10:00 GMT").getTime();
			tt.mock.method(Date, "now", () => now);
			const expiresFor = (headers) =>
				new Date(
					applyExpires(new Response("", { headers })).headers.get("Expires"),
				).getTime();
			// Date 40s ago and Age 40: 40s old, not 80s.
			equal(
				expiresFor({
					"Cache-Control": "max-age=100",
					Age: "40",
					Date: new Date(now - 40 * 1000).toUTCString(),
				}),
				now + 60 * 1000,
			);
			// Date an hour in the future: apparent age is 0, not negative.
			equal(
				expiresFor({
					"Cache-Control": "max-age=60",
					Date: new Date(now + 3600 * 1000).toUTCString(),
				}),
				now + 60 * 1000,
			);
			// Date 30s ago, no Age: the apparent age counts.
			equal(
				expiresFor({
					"Cache-Control": "max-age=60",
					Date: new Date(now - 30 * 1000).toUTCString(),
				}),
				now + 30 * 1000,
			);
		},
	);

	await t.test(
		"cacheExpired: an invalid Expires value counts as already expired",
		async () => {
			// RFC 9111 §5.3: invalid dates (esp. "0") represent a time in the past.
			for (const expires of ["0", "-1", "never", "not a date"]) {
				equal(
					cacheExpired(new Response("", { headers: { Expires: expires } })),
					true,
					expires,
				);
			}
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
