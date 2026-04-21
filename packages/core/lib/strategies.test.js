/* global Request */

import { deepEqual, equal, strictEqual } from "node:assert";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { domain, setupMocks, spy } from "../../../fixtures/helper.js";
import {
	compileConfig,
	fetchInlineStrategy,
	fetchStrategy,
	openCaches,
	pathPattern,
	strategyCacheFirst,
	strategyCacheFirstIgnore,
	strategyCacheOnly,
	strategyHTMLPartition,
	strategyIgnore,
	strategyNetworkFirst,
	strategyNetworkOnly,
	strategyStaleIfError,
	strategyStaleWhileRevalidate,
} from "../index.js";

// Strategies
test("Strategies", async (t) => {
	// Every sub-test calls setupMocks which writes to openCaches["sw-default"].
	// Clean it after each so a failing test doesn't leak its mock into the next.
	t.afterEach(() => {
		delete openCaches["sw-default"];
	});
	// *** strategyNetworkOnly *** //
	await t.test(
		"strategyNetworkOnly: Should resolve 200 from network",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/200`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(strategyNetworkOnly);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 1);
			equal(middleware.afterNetwork.callCount, 1);
			equal(cache.match.callCount, 0);
			equal(cache.put.callCount, 0);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(response.status, 200);
			equal(await response.text(), "{}");
		},
	);

	await t.test(
		"strategyNetworkOnly: Should resolve 404 from network",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/404`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(strategyNetworkOnly);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 1);
			equal(middleware.afterNetwork.callCount, 1);
			equal(cache.match.callCount, 0);
			equal(cache.put.callCount, 0);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(response.status, 404);
		},
	);

	await t.test("strategyNetworkOnly: Should throw from network", async (_t) => {
		const event = {
			__request: new Request(`${domain}/offline`, {
				method: "GET",
			}),
		};
		const { cache, middleware, config } = setupMocks(strategyNetworkOnly);
		try {
			await fetchInlineStrategy(event.__request, event, config);
		} catch (e) {
			deepEqual(e, new Error("offline"));

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 1);
			equal(middleware.afterNetwork.callCount, 1);
			equal(cache.match.callCount, 0);
			equal(cache.put.callCount, 0);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 0);
		}
	});

	// *** strategyCacheOnly *** //
	await t.test(
		"strategyCacheOnly: Should surface miss when cache not found",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/200`, {
					method: "GET",
				}),
			};

			const { cache, middleware, config } = setupMocks(
				strategyCacheOnly,
				`${domain}/cache/notfound`,
			);

			// Strategy throws on miss; fetchStrategy's try/catch swallows the
			// throw and returns the thrown value (undefined here).
			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 0);
			equal(middleware.afterNetwork.callCount, 0);
			equal(cache.match.callCount, 1);
			equal(cache.put.callCount, 0);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			strictEqual(response, undefined);
		},
	);

	await t.test(
		"strategyCacheOnly: Should resolve 200 from cache when exists",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/200`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(
				strategyCacheOnly,
				`${domain}/cache/found`,
			);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 0);
			equal(middleware.afterNetwork.callCount, 0);
			equal(cache.match.callCount, 1);
			equal(cache.put.callCount, 0);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(response.status, 200);
			equal(await response.text(), "{}");
		},
	);

	await t.test(
		"strategyCacheOnly: Should throw undefined when cache is empty",
		async (_t) => {
			const request = new Request(`${domain}/cache-miss-${Date.now()}`, {
				method: "GET",
			});
			const { config } = setupMocks(strategyCacheOnly, null);

			try {
				await strategyCacheOnly(request, {}, config);
				throw new Error("should have thrown");
			} catch (e) {
				strictEqual(e, undefined);
			}
		},
	);

	await t.test(
		"strategyCacheOnly: Should find cached response after SW restart (openCaches empty)",
		async (_t) => {
			// Simulate a prior SW lifetime that populated the Cache Storage
			const realCache = await caches.open("sw-default");
			await realCache.put(
				`${domain}/restart-check`,
				new Response("{}", { status: 200 }),
			);

			// Simulate SW restart: in-memory openCaches is empty
			delete openCaches["sw-default"];

			const request = new Request(`${domain}/restart-check`, { method: "GET" });
			const config = compileConfig({ strategy: strategyCacheOnly });

			const response = await strategyCacheOnly(request, {}, config);

			equal(response?.status, 200);
		},
	);

	// *** strategyNetworkFirst *** //
	await t.test(
		"strategyNetworkFirst: Should resolve 200 from network and cache with {Cache-Control:max-age=86400}",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/cache-control/max-age=86400`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(strategyNetworkFirst);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(response.status, 200);

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 1);
			equal(middleware.afterNetwork.callCount, 1);
			equal(cache.match.callCount, 0);
			equal(cache.put.callCount, 1);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(
				new Date(response.headers.get("Date")) <
					new Date(response.headers.get("Expires")),
				true,
			);
			equal(await response.text(), "{}");
		},
	);

	await t.test(
		"strategyNetworkFirst: Should resolve 200 from network and not cache with {Cache-Control:no-cache}",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/cache-control/no-cache`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(strategyNetworkFirst);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 1);
			equal(middleware.afterNetwork.callCount, 1);
			equal(cache.match.callCount, 0);
			equal(cache.put.callCount, 0);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(response.status, 200);
			equal(response.headers.get("Expires"), null);
			equal(await response.text(), "{}");
		},
	);

	await t.test(
		"strategyNetworkFirst: Should resolve 200 from network and cache with {Cache-Control:max-age=0}",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/cache-control/max-age=0`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(strategyNetworkFirst);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 1);
			equal(middleware.afterNetwork.callCount, 1);
			equal(cache.match.callCount, 0);
			equal(cache.put.callCount, 0);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(response.status, 200);
			equal(response.headers.get("Expires"), null);
			equal(await response.text(), "{}");
		},
	);

	await t.test(
		"strategyNetworkFirst: Should resolve 200 from network and cache with {Cache-Control:null}",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/cache-control/null`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(strategyNetworkFirst);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 1);
			equal(middleware.afterNetwork.callCount, 1);
			equal(cache.match.callCount, 0);
			equal(cache.put.callCount, 0);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(response.status, 200);
			equal(response.headers.get("Expires"), null);
			equal(await response.text(), "{}");
		},
	);

	await t.test(
		"strategyNetworkFirst: Should resolve 200 from cache when network offline",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/offline`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(
				strategyNetworkFirst,
				`${domain}/cache/found`,
			);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 1);
			equal(middleware.afterNetwork.callCount, 1);
			equal(cache.match.callCount, 1);
			equal(cache.put.callCount, 0);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(response.status, 200);
			equal(await response.text(), "{}");
		},
	);

	await t.test(
		"strategyNetworkFirst: Should throw when network offline and no cache",
		async (_t) => {
			const request = new Request(`${domain}/offline`, { method: "GET" });
			const { cache, config } = setupMocks(
				strategyNetworkFirst,
				`${domain}/cache/notfound`,
			);
			const event = { waitUntil: () => {} };

			try {
				await strategyNetworkFirst(request, event, config);
				throw new Error("should have thrown");
			} catch (e) {
				deepEqual(e, new Error("offline"));
				equal(cache.match.callCount, 1);
				equal(cache.put.callCount, 0);
			}
		},
	);

	// *** strategyStaleIfError *** //
	await t.test(
		"strategyStaleIfError: Should resolve 200 from network",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/200`, { method: "GET" }),
			};
			const { cache, middleware, config } = setupMocks(strategyStaleIfError);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 1);
			equal(middleware.afterNetwork.callCount, 1);
			equal(cache.match.callCount, 0);
			equal(cache.put.callCount, 1);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(response.status, 200);
			equal(await response.text(), "{}");
		},
	);

	await t.test(
		"strategyStaleIfError: Should apply Expires from max-age to cached response",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/cache-control/max-age=86400`, {
					method: "GET",
				}),
			};
			const { cache, config } = setupMocks(strategyStaleIfError);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(response.status, 200);
			equal(cache.put.callCount, 1);
			equal(
				new Date(response.headers.get("Date")) <
					new Date(response.headers.get("Expires")),
				true,
			);
		},
	);

	await t.test(
		"strategyStaleIfError: Should resolve 200 from cache when network offline",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/offline`, { method: "GET" }),
			};
			const { cache, middleware, config } = setupMocks(
				strategyStaleIfError,
				`${domain}/cache/expired`,
			);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 1);
			equal(middleware.afterNetwork.callCount, 1);
			equal(cache.match.callCount, 1);
			equal(cache.put.callCount, 0);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(response.status, 200);
			equal(await response.text(), "{}");
		},
	);

	await t.test(
		"strategyStaleIfError: Should throw when network offline and no cache",
		async (_t) => {
			const request = new Request(`${domain}/offline`, { method: "GET" });
			const { cache, config } = setupMocks(
				strategyStaleIfError,
				`${domain}/cache/notfound`,
			);
			const event = { waitUntil: () => {} };

			try {
				await strategyStaleIfError(request, event, config);
				throw new Error("should have thrown");
			} catch (e) {
				deepEqual(e, new Error("offline"));
				equal(cache.match.callCount, 1);
			}
		},
	);

	await t.test(
		"strategyStaleIfError: Should fall back to cache when network returns 5xx",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/503`, { method: "GET" }),
			};
			const { cache, config } = setupMocks(
				strategyStaleIfError,
				`${domain}/cache/expired`,
			);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(response.status, 200);
			equal(await response.text(), "{}");
			equal(cache.match.callCount, 1);
			equal(cache.put.callCount, 0);
		},
	);

	await t.test(
		"strategyStaleIfError: Should return the 5xx when no cache available",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/503`, { method: "GET" }),
			};
			const { cache, config } = setupMocks(
				strategyStaleIfError,
				`${domain}/cache/notfound`,
			);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(response.status, 503);
			equal(cache.match.callCount, 1);
			equal(cache.put.callCount, 0);
		},
	);

	// *** strategyCacheFirst *** //
	await t.test(
		"strategyCacheFirst: Should resolve 200 from network when no cache",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/200`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(
				strategyCacheFirst,
				`${domain}/cache/notfound`,
			);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(response.status, 200);

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 1);
			equal(middleware.afterNetwork.callCount, 1);
			equal(cache.match.callCount, 1);
			equal(cache.put.callCount, 1);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(await response.text(), "{}");
		},
	);

	await t.test(
		"strategyCacheFirst: Should resolve 200 from cache",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/404`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(
				strategyCacheFirst,
				`${domain}/cache/found`,
			);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 0);
			equal(middleware.afterNetwork.callCount, 0);
			equal(cache.match.callCount, 1);
			equal(cache.put.callCount, 0);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(response.status, 200);
			equal(await response.text(), "{}");
		},
	);

	await t.test(
		"strategyCacheFirst: Should resolve 200 from cache when expired",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/offline`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(
				strategyCacheFirst,
				`${domain}/cache/expired`,
			);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(response.status, 200);

			equal(middleware.before.callCount, 1);
			equal(cache.match.callCount, 2);
			equal(middleware.beforeNetwork.callCount, 1);
			equal(middleware.afterNetwork.callCount, 1);
			equal(cache.put.callCount, 0);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(await response.text(), "{}");
		},
	);

	await t.test(
		"strategyCacheFirst: stale-if-error should serve expired cache when network fails",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/offline`, { method: "GET" }),
			};
			const { cache, middleware, config } = setupMocks(
				strategyCacheFirst,
				`${domain}/cache/expired`,
			);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			// Network throws → fall back to the (expired) cached copy
			equal(response.status, 200);
			equal(cache.match.callCount, 2);
			equal(middleware.beforeNetwork.callCount, 1);
			equal(middleware.afterNetwork.callCount, 1);
			equal(middleware.after.callCount, 1);
		},
	);

	// *** strategyStaleWhileRevalidate *** //

	await t.test(
		"strategyStaleWhileRevalidate: Should resolve 200 from network when no cache",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/200`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(
				strategyStaleWhileRevalidate,
				`${domain}/cache/notfound`,
			);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(response.status, 200);

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 1);
			equal(middleware.afterNetwork.callCount, 1);
			equal(cache.match.callCount, 1);
			equal(cache.put.callCount, 1);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(await response.text(), "{}");
		},
	);

	await t.test(
		"strategyStaleWhileRevalidate: Should resolve 200 from cache",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/200`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(
				strategyStaleWhileRevalidate,
				`${domain}/cache/found`,
			);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(response.status, 200);

			equal(middleware.before.callCount, 1);
			equal(cache.match.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 0);
			equal(middleware.afterNetwork.callCount, 0);
			equal(cache.put.callCount, 0);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(await response.text(), "{}");
		},
	);

	await t.test(
		"strategyStaleWhileRevalidate: Should resolve 200 from cache, revalidates when expired",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/200`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(
				strategyStaleWhileRevalidate,
				`${domain}/cache/expired`,
			);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(response.status, 200);

			equal(middleware.before.callCount, 1);
			equal(cache.match.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 1);
			equal(middleware.afterNetwork.callCount, 1);
			equal(cache.put.callCount, 1);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(await response.text(), "{}");
		},
	);

	await t.test(
		"strategyStaleWhileRevalidate: Should swallow background revalidation error",
		async (_t) => {
			const waitUntils = [];
			const event = {
				__request: new Request(`${domain}/offline`, {
					method: "GET",
				}),
				waitUntil: (fct) => waitUntils.push(fct),
			};
			// Use cache/expired for initial match, but background revalidation
			// will call strategyCacheOnly which returns expired → then strategyNetworkFirst
			// throws → catch(() => {}) swallows it
			const { cache, config } = setupMocks(
				strategyStaleWhileRevalidate,
				`${domain}/cache/expired`,
			);
			// After first match, make cache return undefined so background
			// networkFirst fallback to cacheOnly finds nothing and throws
			const origMatch = cache.match;
			let matchCallCount = 0;
			cache.match = (...args) => {
				matchCallCount++;
				if (matchCallCount > 1) return undefined;
				return origMatch(...args);
			};

			const response = await fetchStrategy(event.__request, event, config);

			equal(response.status, 200);
			// Wait for background revalidation (which should fail and be caught)
			await Promise.all(waitUntils);
		},
	);

	// *** strategyIgnore *** //
	await t.test("strategyIgnore: Should always return 504", async (_t) => {
		const event = {
			__request: new Request(`${domain}/offline`, {
				method: "GET",
			}),
		};
		const { cache, middleware, config } = setupMocks(strategyIgnore);
		const response = await fetchInlineStrategy(event.__request, event, config);

		equal(middleware.before.callCount, 1);
		equal(middleware.beforeNetwork.callCount, 0);
		equal(middleware.afterNetwork.callCount, 0);
		equal(cache.match.callCount, 0);
		equal(cache.put.callCount, 0);
		equal(cache.delete.callCount, 0);
		equal(middleware.after.callCount, 1);

		equal(response.status, 504);
		equal(await response.text(), "");
	});

	// *** strategyCacheFirstIgnore *** //
	await t.test(
		"strategyCacheFirstIgnore: Should resolve 504 from network",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/200`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(
				strategyCacheFirstIgnore,
				`${domain}/cache/notfound`,
			);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 0);
			equal(middleware.afterNetwork.callCount, 0);
			equal(cache.match.callCount, 1);
			equal(cache.put.callCount, 0);
			equal(cache.delete.callCount, 0);
			equal(middleware.after.callCount, 1);

			equal(response.status, 504);
			equal(await response.text(), "");
		},
	);

	// *** strategyCacheFirstIgnore with expired cache *** //
	await t.test(
		"strategyCacheFirstIgnore: Should resolve 504 when cache is expired",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/200`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(
				strategyCacheFirstIgnore,
				`${domain}/cache/expired`,
			);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(middleware.before.callCount, 1);
			equal(cache.match.callCount, 1);
			equal(middleware.after.callCount, 1);

			equal(response.status, 504);
		},
	);

	// *** strategyCacheFirstIgnore with valid cache *** //
	await t.test(
		"strategyCacheFirstIgnore: Should resolve 200 from valid cache",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/200`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(
				strategyCacheFirstIgnore,
				`${domain}/cache/found`,
			);

			const response = await fetchInlineStrategy(
				event.__request,
				event,
				config,
			);

			equal(middleware.before.callCount, 1);
			equal(cache.match.callCount, 1);
			equal(middleware.after.callCount, 1);

			equal(response.status, 200);
		},
	);

	// *** strategyStatic *** //
	await t.test("strategyStatic: Should return cloned response", async (_t) => {
		const { strategyStatic } = await import("../index.js");
		const staticResponse = new Response("static body", { status: 200 });
		const strategy = strategyStatic(staticResponse);

		const event = {
			__request: new Request(`${domain}/200`, {
				method: "GET",
			}),
		};
		const { config } = setupMocks(strategy);

		const response = await fetchInlineStrategy(event.__request, event, config);

		equal(response.status, 200);
		equal(await response.text(), "static body");
	});

	await t.test(
		"strategyStatic: Should throw when passed an Error so error-path runs",
		async (_t) => {
			const { strategyStatic } = await import("../index.js");
			const error = new Error("some error");
			const strategy = strategyStatic(error);

			const event = {
				__request: new Request(`${domain}/200`, {
					method: "GET",
				}),
			};
			const { config } = setupMocks(strategy);

			// fetchInlineStrategy routes thrown errors through after-middleware,
			// which in our setup returns the Error as the result.
			const result = await fetchInlineStrategy(event.__request, event, config);
			equal(result, error);

			// Calling the raw strategy rejects — fetchStrategy's try/catch
			// captures the error and routes it through error-path middleware.
			let caught;
			try {
				await strategy();
			} catch (e) {
				caught = e;
			}
			equal(caught, error);
		},
	);

	// *** strategyPartition *** //
	await t.test(
		"strategyPartition: Should work without makeRequest option",
		async (_t) => {
			const { strategyPartition } = await import("../index.js");
			const waitUntils = [];
			const event = {
				__request: new Request(`${domain}/200`, {
					method: "GET",
				}),
				waitUntil: (fct) => waitUntils.push(fct),
			};
			const nestedMiddleware = {
				before: spy((request) => request),
				beforeNetwork: spy((request) => request),
				afterNetwork: spy((_request, response) => response),
				after: spy((_request, response) => response),
			};
			const { config } = setupMocks(
				strategyPartition(
					compileConfig({
						routes: [{ path: "/200" }],
						strategy: strategyNetworkOnly,
						middlewares: [nestedMiddleware],
					}),
				),
			);

			const response = await fetchStrategy(event.__request, event, config);
			// Must consume the stream body so pull() completes and streamDeferred resolves
			await response.text();
			await Promise.all(waitUntils);

			equal(response.status, 200);
			// Response.url is "" for synthesized Responses per Fetch spec;
			// partition composites can't legitimately carry a URL.
			equal(response.url, "");
		},
	);

	await t.test(
		"strategyPartition: Should resolve stream cancel",
		async (_t) => {
			const { strategyPartition } = await import("../index.js");
			const waitUntils = [];
			const event = {
				__request: new Request(`${domain}/200`, {
					method: "GET",
				}),
				waitUntil: (fct) => waitUntils.push(fct),
			};
			const nestedMiddleware = {
				before: spy((request) => request),
				beforeNetwork: spy((request) => request),
				afterNetwork: spy((_request, response) => response),
				after: spy((_request, response) => response),
			};
			const { config } = setupMocks(
				strategyPartition(
					compileConfig({
						routes: [
							{ path: "$1/header" },
							{ path: "$1/main" },
							{ path: "$1/footer" },
						],
						strategy: strategyNetworkOnly,
						middlewares: [nestedMiddleware],
					}),
				),
			);
			config.pathPattern = pathPattern("(.*?)/([^/]*?)$");

			const response = await fetchStrategy(event.__request, event, config);
			// Cancel the stream to trigger the cancel() callback (line 164)
			await response.body.cancel();
			await Promise.all(waitUntils);
		},
	);

	await t.test(
		"strategyPartition: with options.headers skips blocking on first response",
		async (_t) => {
			const { strategyPartition } = await import("../index.js");
			const originalFetch = globalThis.fetch;
			// Never-resolving fetch: if the strategy blocks on the first
			// response, the test will hang. Passing options.headers must
			// bypass that.
			globalThis.fetch = () => new Promise(() => {});

			const waitUntils = [];
			const event = {
				__request: new Request(`${domain}/200`, { method: "GET" }),
				waitUntil: (fct) => waitUntils.push(fct),
			};
			const { config } = setupMocks(
				strategyPartition(
					compileConfig({
						routes: [{ path: "/a" }],
						strategy: strategyNetworkOnly,
						middlewares: [],
						headers: { "Content-Type": "text/html; charset=utf-8" },
					}),
				),
			);

			// Should return immediately without awaiting fetch.
			const response = await fetchStrategy(event.__request, event, config);
			strictEqual(
				response.headers.get("Content-Type"),
				"text/html; charset=utf-8",
			);
			// Don't consume body (it would block on fetch).
			await response.body.cancel();
			await Promise.allSettled(waitUntils);

			globalThis.fetch = originalFetch;
		},
	);

	await t.test(
		"strategyPartition: composite response carries first sub-response's headers",
		async (_t) => {
			const { strategyPartition } = await import("../index.js");
			const originalFetch = globalThis.fetch;
			globalThis.fetch = async () =>
				new Response("x", {
					status: 200,
					headers: new Headers({
						"Content-Type": "text/html; charset=utf-8",
						"X-Composite-Marker": "first",
					}),
				});

			const waitUntils = [];
			const event = {
				__request: new Request(`${domain}/200`, { method: "GET" }),
				waitUntil: (fct) => waitUntils.push(fct),
			};
			const { config } = setupMocks(
				strategyPartition(
					compileConfig({
						routes: [{ path: "/a" }],
						strategy: strategyNetworkOnly,
						middlewares: [],
					}),
				),
			);

			const response = await fetchStrategy(event.__request, event, config);
			await response.text();
			await Promise.all(waitUntils);

			strictEqual(
				response.headers.get("Content-Type"),
				"text/html; charset=utf-8",
			);
			strictEqual(response.headers.get("X-Composite-Marker"), "first");

			globalThis.fetch = originalFetch;
		},
	);

	await t.test(
		"strategyPartition: body.cancel() aborts in-flight sub-request signals",
		async (_t) => {
			const { strategyPartition } = await import("../index.js");

			const originalFetch = globalThis.fetch;
			const seen = [];
			// First fetch resolves (so the strategy can return); the rest hang
			// until the signal aborts.
			globalThis.fetch = (request) => {
				seen.push(request);
				if (seen.length === 1) {
					return Promise.resolve(
						new Response("", {
							status: 200,
							headers: new Headers({ Date: new Date().toString() }),
						}),
					);
				}
				return new Promise((_resolve, reject) => {
					request.signal?.addEventListener("abort", () => {
						reject(new DOMException("Aborted", "AbortError"));
					});
				});
			};

			const waitUntils = [];
			const event = {
				__request: new Request(`${domain}/200`, { method: "GET" }),
				waitUntil: (fct) => waitUntils.push(fct),
			};
			const { config } = setupMocks(
				strategyPartition(
					compileConfig({
						routes: [{ path: "/a" }, { path: "/b" }, { path: "/c" }],
						strategy: strategyNetworkOnly,
						middlewares: [],
					}),
				),
			);

			const response = await fetchStrategy(event.__request, event, config);
			await response.body.cancel();
			await Promise.allSettled(waitUntils);

			strictEqual(seen.length, 3);
			// Later sub-requests still in-flight when cancel fires must abort.
			strictEqual(seen[1].signal.aborted, true);
			strictEqual(seen[2].signal.aborted, true);

			globalThis.fetch = originalFetch;
		},
	);

	await t.test(
		"strategyPartition: stream/streamDeferred rejects when sub-response fails (options.headers supplied)",
		async (_t) => {
			const { strategyPartition } = await import("../index.js");
			const waitUntils = [];
			const event = {
				__request: new Request(`${domain}/200`, { method: "GET" }),
				waitUntil: (fct) => waitUntils.push(fct),
			};
			const failingStrategy = () => {
				throw new Error("sub-response failed");
			};
			const { config } = setupMocks(
				strategyPartition({
					...compileConfig({
						routes: [{ path: "$1/fail" }],
						strategy: failingStrategy,
						middlewares: [],
					}),
					// Supplying headers skips the upfront await-first-response path,
					// so the failure must surface via the stream itself.
					headers: new Headers({ "Content-Type": "text/html" }),
				}),
			);
			config.pathPattern = pathPattern("(.*?)/([^/]*?)$");

			const response = await fetchStrategy(event.__request, event, config);
			let streamCaught = false;
			try {
				const reader = response.body.getReader();
				while (true) {
					const { done } = await reader.read();
					if (done) break;
				}
			} catch {
				streamCaught = true;
			}
			equal(streamCaught, true);
			let deferredCaught = false;
			try {
				await Promise.all(waitUntils);
			} catch {
				deferredCaught = true;
			}
			equal(deferredCaught, true);
		},
	);

	await t.test(
		"strategyPartition: surfaces first-sub-response failure as a thrown error when no options.headers",
		async (_t) => {
			const { strategyPartition } = await import("../index.js");
			const waitUntils = [];
			const event = {
				__request: new Request(`${domain}/200`, { method: "GET" }),
				waitUntil: (fct) => waitUntils.push(fct),
			};
			const failingStrategy = () => {
				throw new Error("first sub failed");
			};
			const { config } = setupMocks(
				strategyPartition(
					compileConfig({
						routes: [{ path: "$1/fail" }],
						strategy: failingStrategy,
						middlewares: [],
					}),
				),
			);
			config.pathPattern = pathPattern("(.*?)/([^/]*?)$");

			const result = await fetchStrategy(event.__request, event, config);
			strictEqual(result instanceof Error, true);
			strictEqual(/first sub failed/.test(result.message), true);
		},
	);

	// *** strategyHTMLPartition *** //
	await t.test(
		"strategyHTMLPartition: Should resolve 200 from network",
		async (_t) => {
			const waitUntils = [];
			const event = {
				__request: new Request(`${domain}/200`, {
					method: "GET",
				}),
				waitUntil: (fct) => waitUntils.push(fct),
			};
			const nestedMiddleware = {
				before: spy((request) => request),
				beforeNetwork: spy((request) => request),
				afterNetwork: spy((_request, response) => response),
				after: spy((_request, response) => response),
			};
			const { cache, middleware, config } = setupMocks(
				strategyHTMLPartition(
					compileConfig({
						routes: [
							{ path: "$1/header" },
							{ path: "$1/main" },
							{ path: "$1/footer" },
						],
						strategy: strategyNetworkOnly,
						middlewares: [nestedMiddleware],
					}),
				),
			);
			config.pathPattern = pathPattern("(.*?)/([^/]*?)$");

			const res = fetchStrategy(event.__request, event, config);
			await Promise.all(waitUntils);
			const response = await res;
			await setTimeout(100);

			equal(response.status, 200);

			equal(middleware.before.callCount, 1);
			equal(middleware.beforeNetwork.callCount, 0);
			equal(middleware.afterNetwork.callCount, 0);
			equal(nestedMiddleware.before.callCount, 3);
			equal(nestedMiddleware.beforeNetwork.callCount, 3);
			equal(nestedMiddleware.afterNetwork.callCount, 3);
			equal(cache.match.callCount, 0);
			equal(cache.put.callCount, 0);
			equal(cache.delete.callCount, 0);
			equal(nestedMiddleware.after.callCount, 3);
			equal(middleware.after.callCount, 1);

			equal(
				await response.text(),
				"<html><head></head><body><header></header><main></main><script></script><footer></footer></body></html>",
			);
		},
	);

	await t.test(
		"strategyHTMLPartition: must not mutate caller options",
		async (_t) => {
			const userOptions = compileConfig({
				routes: [{ path: "$1/header" }],
				strategy: strategyNetworkOnly,
				middlewares: [],
			});
			const before = userOptions.makeRequest;
			strategyHTMLPartition(userOptions);
			strictEqual(userOptions.makeRequest, before);
		},
	);

	await t.test(
		"strategyHTMLPartition: sub-requests preserve method and headers",
		async (_t) => {
			const originalFetch = globalThis.fetch;
			const seen = [];
			globalThis.fetch = (request) => {
				seen.push({
					url: request.url,
					method: request.method,
					auth: request.headers.get("Authorization"),
				});
				return Promise.resolve(
					new Response("", {
						status: 200,
						headers: new Headers({ Date: new Date().toString() }),
					}),
				);
			};

			const waitUntils = [];
			const event = {
				__request: new Request(`${domain}/pages/home`, {
					method: "POST",
					headers: new Headers({ Authorization: "Bearer abc" }),
				}),
				waitUntil: (fct) => waitUntils.push(fct),
			};
			const { config } = setupMocks(
				strategyHTMLPartition(
					compileConfig({
						routes: [{ path: "$1/header" }, { path: "$1/footer" }],
						strategy: strategyNetworkOnly,
						middlewares: [],
					}),
				),
			);
			config.pathPattern = pathPattern("(.*?)/([^/]*?)$");

			const response = await fetchStrategy(event.__request, event, config);
			await response.text();
			await Promise.all(waitUntils);

			strictEqual(seen.length, 2);
			for (const sub of seen) {
				strictEqual(sub.method, "POST");
				strictEqual(sub.auth, "Bearer abc");
			}

			globalThis.fetch = originalFetch;
		},
	);
});
