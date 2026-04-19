/* global Response Headers */

import { equal, strictEqual } from "node:assert";
import { mock, test } from "node:test";
import "../../../fixtures/helper.js";
import {
	applyExpires,
	cacheDeleteExpired,
	cacheExpired,
	cachePut,
	openCaches,
} from "../index.js";

test("cache", async (t) => {
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
			Object.defineProperty(expiredResponse, "url", {
				value: "http://localhost:8080/expired",
			});

			const validResponse = new Response("", {
				headers: new Headers({ Expires: futureDate }),
			});
			Object.defineProperty(validResponse, "url", {
				value: "http://localhost:8080/valid",
			});

			const deleteFn = mock.fn();
			const mockCache = {
				matchAll: () => Promise.resolve([expiredResponse, validResponse]),
				delete: deleteFn,
			};

			// Override caches.open to return our mock
			const originalOpen = globalThis.caches.open;
			globalThis.caches.open = () => Promise.resolve(mockCache);

			await cacheDeleteExpired("test-expired");

			equal(deleteFn.mock.callCount(), 1);
			equal(
				deleteFn.mock.calls[0].arguments[0],
				"http://localhost:8080/expired",
			);

			// Restore
			globalThis.caches.open = originalOpen;
		},
	);

	await t.test(
		"cacheDeleteExpired: should handle matchAll returning nullish",
		async () => {
			const deleteFn = mock.fn();
			const mockCache = {
				matchAll: () => Promise.resolve(null),
				delete: deleteFn,
			};

			const originalOpen = globalThis.caches.open;
			globalThis.caches.open = () => Promise.resolve(mockCache);

			await cacheDeleteExpired("test-null");

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
			Object.defineProperty(validResponse, "url", {
				value: "http://localhost:8080/valid",
			});

			const deleteFn = mock.fn();
			const mockCache = {
				matchAll: () => Promise.resolve([validResponse]),
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

			const deleteFn = mock.fn();
			const originalOpen = globalThis.caches.open;
			globalThis.caches.open = () =>
				Promise.resolve({
					matchAll: () => Promise.resolve([]),
					delete: deleteFn,
				});
			tt.after(() => {
				delete openCaches["quota-cache"];
				globalThis.caches.open = originalOpen;
			});

			const request = new Request("http://localhost:8080/test");
			const response = new Response("body", { status: 200 });

			await cachePut("quota-cache", request, response);

			equal(putFn.mock.callCount(), 2);
		},
	);

	await t.test("cachePut: should throw non-QuotaExceededError", async (tt) => {
		const putFn = mock.fn(() => {
			throw new TypeError("some other error");
		});
		openCaches["error-cache"] = { put: putFn };
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
					matchAll: () => Promise.resolve([]),
					delete: mock.fn(),
				});
			globalThis.caches.keys = () => Promise.resolve([]);
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
			Object.defineProperty(expiredResponse, "url", {
				value: "http://localhost:8080/expired",
			});

			const deleteFn = mock.fn();
			const mockCache = {
				matchAll: () => Promise.resolve([expiredResponse]),
				delete: deleteFn,
			};

			const originalKeys = globalThis.caches.keys;
			const originalOpen = globalThis.caches.open;
			globalThis.caches.keys = () => Promise.resolve(["cache-a", "cache-b"]);
			globalThis.caches.open = () => Promise.resolve(mockCache);

			await cachesDeleteExpired();

			equal(deleteFn.mock.callCount(), 2);

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
			globalThis.caches.keys = () => Promise.resolve(["sw-default", "sw-old"]);
			globalThis.caches.delete = mock.fn((key) => {
				deletedKeys.push(key);
				return Promise.resolve(true);
			});

			await cachesDelete();

			equal(deletedKeys.length, 2);

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
});
