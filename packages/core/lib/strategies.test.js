/* global Request */

import { deepEqual, equal } from "node:assert";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { domain, setupMocks, spy } from "../../../fixtures/helper.js";
import {
	compileConfig,
	fetchInlineStrategy,
	fetchStrategy,
	openCaches,
	pathPattern,
	staleIfError,
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
		"strategyCacheOnly: Should resolve 504 from cache when not found",
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

			equal(response?.status, 504);
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
		"strategyCacheOnly: Should resolve 504 from cache when not found",
		async (_t) => {
			const request = new Request(`${domain}/cache-miss-${Date.now()}`, {
				method: "GET",
			});
			const { config } = setupMocks(strategyCacheOnly, null);

			const response = await strategyCacheOnly(request, {}, config);

			equal(response?.status, 504);
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
			const event = {
				__request: new Request(`${domain}/offline`, {
					method: "GET",
				}),
			};
			const { cache, middleware, config } = setupMocks(
				strategyNetworkFirst,
				`${domain}/cache/notfound`,
			);

			try {
				await fetchInlineStrategy(event.__request, event, config);
			} catch (e) {
				deepEqual(e, new Error("offline"));

				equal(middleware.before.callCount, 1);
				equal(middleware.beforeNetwork.callCount, 1);
				equal(middleware.afterNetwork.callCount, 1);
				equal(cache.match.callCount, 1);
				equal(cache.put.callCount, 0);
				equal(cache.delete.callCount, 0);
				equal(middleware.after.callCount, 0);
			}
		},
	);

	// *** staleIfError *** //
	await t.test(
		"staleIfError: Should pass through ok response without checking cache",
		async (_t) => {
			const request = new Request(`${domain}/200`, { method: "GET" });
			const { cache, config } = setupMocks(undefined, `${domain}/cache/found`);
			const input = new Response("{}", { status: 200 });

			const result = await staleIfError(request, input, config);

			equal(result, input);
			equal(cache.match.callCount, 0);
		},
	);

	await t.test(
		"staleIfError: Should serve cached response when given a 5xx",
		async (_t) => {
			const request = new Request(`${domain}/500`, { method: "GET" });
			const { cache, config } = setupMocks(
				undefined,
				`${domain}/cache/expired`,
			);
			const input = new Response("", { status: 503 });

			const result = await staleIfError(request, input, config);

			equal(result.status, 200);
			equal(cache.match.callCount, 1);
		},
	);

	await t.test(
		"staleIfError: Should serve cached response when given a thrown error",
		async (_t) => {
			const request = new Request(`${domain}/offline`, { method: "GET" });
			const { cache, config } = setupMocks(
				undefined,
				`${domain}/cache/expired`,
			);

			const result = await staleIfError(request, new Error("offline"), config);

			equal(result.status, 200);
			equal(cache.match.callCount, 1);
		},
	);

	await t.test(
		"staleIfError: Should return the 5xx when no cache available",
		async (_t) => {
			const request = new Request(`${domain}/500`, { method: "GET" });
			const { config } = setupMocks(undefined, `${domain}/cache/notfound`);
			const input = new Response("", { status: 503 });

			const result = await staleIfError(request, input, config);

			equal(result, input);
		},
	);

	await t.test(
		"staleIfError: Should rethrow the error when no cache available",
		async (_t) => {
			const request = new Request(`${domain}/offline`, { method: "GET" });
			const { config } = setupMocks(undefined, `${domain}/cache/notfound`);

			try {
				await staleIfError(request, new Error("offline"), config);
				throw new Error("should have thrown");
			} catch (e) {
				deepEqual(e, new Error("offline"));
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
		"strategyStaleIfError: Should cache a 200 without Cache-Control",
		async (_t) => {
			const event = {
				__request: new Request(`${domain}/cache-control/null`, {
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
	await t.test("strategyIgnore: Should always return 408", async (_t) => {
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

		equal(response.status, 408);
		equal(await response.text(), "");
	});

	// *** strategyCacheFirstIgnore *** //
	await t.test(
		"strategyCacheFirstIgnore: Should resolve 408 from network",
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

			equal(response.status, 408);
			equal(await response.text(), "");
		},
	);

	// *** strategyCacheFirstIgnore with expired cache *** //
	await t.test(
		"strategyCacheFirstIgnore: Should resolve 408 when cache is expired",
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

			equal(response.status, 408);
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
		"strategyStatic: Should return error when passed non-response",
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

			const result = await fetchInlineStrategy(event.__request, event, config);

			equal(result, error);
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
			equal(response.url, `${domain}/200`);
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
		"strategyPartition: Should reject streamDeferred when sub-response fails",
		async (_t) => {
			const { strategyPartition } = await import("../index.js");
			const waitUntils = [];
			const event = {
				__request: new Request(`${domain}/200`, { method: "GET" }),
				waitUntil: (fct) => waitUntils.push(fct),
			};
			// Create a partition where the route strategy fails
			const failingStrategy = () => {
				throw new Error("sub-response failed");
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

			const response = await fetchStrategy(event.__request, event, config);
			// Read stream — should error because sub-response has no arrayBuffer()
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
			// streamDeferred should also reject
			let deferredCaught = false;
			try {
				await Promise.all(waitUntils);
			} catch {
				deferredCaught = true;
			}
			equal(deferredCaught, true);
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
});
