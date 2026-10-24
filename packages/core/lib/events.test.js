/* global Request Response Headers */

import { deepEqual, equal, match, rejects, strictEqual } from "node:assert";
import { mock, test } from "node:test";
import { cacheStore } from "../../../fixtures/helper.js";
import {
	backgroundFetchFailEvent,
	backgroundFetchSuccessEvent,
	cacheOverrideEvent,
	compileConfig,
	consoleError,
	eventActivate,
	eventFetch,
	eventInstall,
	fetchInlineStrategy,
	fetchStrategy,
	findRouteConfig,
	pathPattern,
	strategyNetworkFirst,
	strategyNetworkOnly,
} from "../index.js";

test("events", async (t) => {
	// *** findRouteConfig *** //
	await t.test(
		"findRouteConfig: should return matching route config",
		async () => {
			const config = compileConfig({
				middlewares: [],
				routes: [
					{
						methods: ["GET"],
						pathPattern: pathPattern("/api/.*$"),
						cacheName: "api",
					},
					{
						methods: ["POST"],
						pathPattern: pathPattern("/submit$"),
						cacheName: "submit",
					},
				],
			});

			const request = new Request("http://localhost:8080/api/users", {
				method: "GET",
			});
			const result = findRouteConfig(config, request);
			equal(result.cacheName, "api");
		},
	);

	await t.test(
		"findRouteConfig: should return base config when no route matches",
		async () => {
			const config = compileConfig({
				middlewares: [],
				routes: [
					{
						methods: ["GET"],
						pathPattern: pathPattern("/api/.*$"),
						cacheName: "api",
					},
				],
			});

			const request = new Request("http://localhost:8080/other", {
				method: "GET",
			});
			const result = findRouteConfig(config, request);
			equal(result, config);
		},
	);

	await t.test(
		"findRouteConfig: a global/sticky pathPattern matches on every call",
		async () => {
			// RegExp#test on a g/y pattern advances lastIndex, so a shared route
			// regex would alternate hit and miss.
			for (const pattern of [/\/api\//g, /http/y]) {
				const config = compileConfig({
					middlewares: [],
					routes: [{ pathPattern: pattern, cacheName: "api" }],
				});
				const request = new Request("http://localhost:8080/api/users");
				for (let i = 0; i < 3; i++) {
					equal(findRouteConfig(config, request).cacheName, "api", `${i}`);
				}
			}
		},
	);

	// *** fetchStrategy error path *** //
	await t.test(
		"fetchStrategy: should catch strategy error and pass to after middleware",
		async () => {
			const error = new Error("strategy failed");
			const afterFn = mock.fn((_request, response) => response);
			const config = {
				before: [],
				after: [afterFn],
				strategy: () => {
					throw error;
				},
			};
			const request = new Request("http://localhost:8080/test");
			const event = {};

			const result = await fetchStrategy(request, event, config);

			equal(afterFn.mock.callCount(), 1);
			equal(result, error);
		},
	);

	await t.test(
		"fetchStrategy: throwing before-hook still runs after-hooks and returns the error as a value",
		async (t) => {
			// The before-hook throw is surfaced via consoleError (unexpected hook
			// bug); silence it so the expected error doesn't pollute test output.
			t.mock.method(console, "error", () => {});
			const error = new Error("before failed");
			// after-hook reshapes the error into a Response so we can prove it ran
			// and that the before-hook throw never short-circuited it.
			const recovered = new Response("recovered", { status: 200 });
			const afterFn = mock.fn(() => recovered);
			const strategyFn = mock.fn(() => new Response("ok"));
			const config = {
				before: [
					() => {
						throw error;
					},
				],
				after: [afterFn],
				strategy: strategyFn,
			};
			const request = new Request("http://localhost:8080/test");
			const event = {};

			// Must NOT reject (value contract) and must skip the strategy because
			// the before-hook failed, while still running the paired after-hook.
			const result = await fetchStrategy(request, event, config);

			equal(strategyFn.mock.callCount(), 0);
			equal(afterFn.mock.callCount(), 1);
			// after-hook received the before-hook error as the response argument.
			equal(afterFn.mock.calls[0].arguments[1], error);
			equal(result, recovered);
		},
	);

	await t.test(
		"fetchStrategy: throwing after-hook is captured as a value, later after-hooks still run",
		async (t) => {
			// The after-hook throw is surfaced via consoleError (unexpected hook
			// bug); silence it so the expected error doesn't pollute test output.
			t.mock.method(console, "error", () => {});
			const error = new Error("after failed");
			const firstAfter = mock.fn(() => {
				throw error;
			});
			// Second after-hook must still run and observe the captured error.
			const secondAfter = mock.fn((_request, response) => response);
			const config = {
				before: [],
				after: [firstAfter, secondAfter],
				strategy: () => new Response("ok", { status: 200 }),
			};
			const request = new Request("http://localhost:8080/test");
			const event = {};

			const result = await fetchStrategy(request, event, config);

			equal(firstAfter.mock.callCount(), 1);
			equal(secondAfter.mock.callCount(), 1);
			equal(secondAfter.mock.calls[0].arguments[1], error);
			equal(result, error);
		},
	);

	// *** fetchStrategy observability: expected vs unexpected throws *** //
	await t.test(
		"fetchStrategy: a throwing before-hook is unexpected and is reported via consoleError",
		async (t) => {
			// A before-hook throwing is a programming bug, not an expected
			// network/HTTP error, so it must be surfaced (consoleError) even though
			// the value contract still captures it as the response value.
			const errorMock = t.mock.method(console, "error", () => {});
			const error = new Error("before bug");
			const afterFn = mock.fn((_request, response) => response);
			const config = {
				before: [
					() => {
						throw error;
					},
				],
				after: [afterFn],
				strategy: mock.fn(() => new Response("ok")),
			};
			const request = new Request("http://localhost:8080/test");
			const event = {};

			const result = await fetchStrategy(request, event, config);

			// The before-hook error was logged (observability) ...
			equal(errorMock.mock.callCount(), 1);
			equal(errorMock.mock.calls[0].arguments[0], error);
			// ... and the existing value contract is preserved: strategy skipped,
			// after-loop ran, the error came back as the value.
			equal(config.strategy.mock.callCount(), 0);
			equal(afterFn.mock.callCount(), 1);
			equal(afterFn.mock.calls[0].arguments[1], error);
			equal(result, error);
		},
	);

	await t.test(
		"fetchStrategy: a throwing strategy is the expected error path and stays SILENT",
		async (t) => {
			// Network/HTTP failures throw out of the strategy (e.g.
			// strategyNetworkOnly throws a non-Response). These are expected and
			// must NOT spam consoleError.
			const errorMock = t.mock.method(console, "error", () => {});
			const error = new Error("network down");
			const afterFn = mock.fn((_request, response) => response);
			const config = {
				before: [],
				after: [afterFn],
				strategy: () => {
					throw error;
				},
			};
			const request = new Request("http://localhost:8080/test");
			const event = {};

			const result = await fetchStrategy(request, event, config);

			// Expected error path: no logging.
			equal(errorMock.mock.callCount(), 0);
			// Value contract preserved: after-loop ran, error returned as value.
			equal(afterFn.mock.callCount(), 1);
			equal(afterFn.mock.calls[0].arguments[1], error);
			equal(result, error);
		},
	);

	await t.test(
		"fetchStrategy: a throwing after-hook is unexpected and is reported via consoleError",
		async (t) => {
			// An after-hook throwing is a programming bug, so it is logged, but the
			// value contract is preserved: it's captured as the value and later
			// after-hooks still run.
			const errorMock = t.mock.method(console, "error", () => {});
			const error = new Error("after bug");
			const firstAfter = mock.fn(() => {
				throw error;
			});
			const secondAfter = mock.fn((_request, response) => response);
			const config = {
				before: [],
				after: [firstAfter, secondAfter],
				strategy: () => new Response("ok", { status: 200 }),
			};
			const request = new Request("http://localhost:8080/test");
			const event = {};

			const result = await fetchStrategy(request, event, config);

			// The after-hook bug was logged ...
			equal(errorMock.mock.callCount(), 1);
			equal(errorMock.mock.calls[0].arguments[0], error);
			// ... and the value contract held: captured as value, next after ran.
			equal(firstAfter.mock.callCount(), 1);
			equal(secondAfter.mock.callCount(), 1);
			equal(secondAfter.mock.calls[0].arguments[1], error);
			equal(result, error);
		},
	);

	// Sanity: the consoleError export is wired to console.error so the mocks
	// above actually intercept the calls fetchStrategy makes.
	await t.test(
		"consoleError: delegates to console.error (mock target sanity)",
		async (t) => {
			const errorMock = t.mock.method(console, "error", () => {});
			const payload = new Error("boom");
			consoleError(payload);
			equal(errorMock.mock.callCount(), 1);
			equal(errorMock.mock.calls[0].arguments[0], payload);
		},
	);

	// *** eventInstall *** //
	await t.test(
		"eventInstall: should call waitUntil and skipWaiting",
		async () => {
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };

			const originalSkipWaiting = globalThis.skipWaiting;
			const skipWaitingFn = mock.fn();
			globalThis.skipWaiting = skipWaitingFn;

			const config = compileConfig({
				middlewares: [],
				precache: {
					routes: [],
					eventType: false,
				},
			});

			eventInstall(event, config);

			equal(waitUntilFn.mock.callCount(), 1);
			equal(skipWaitingFn.mock.callCount(), 1);

			// Wait for the promise
			await waitUntilFn.mock.calls[0].arguments[0];

			globalThis.skipWaiting = originalSkipWaiting;
		},
	);

	await t.test(
		"eventInstall: should NOT call skipWaiting when config.skipWaiting is false",
		async () => {
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };

			const originalSkipWaiting = globalThis.skipWaiting;
			const skipWaitingFn = mock.fn();
			globalThis.skipWaiting = skipWaitingFn;

			const config = compileConfig({
				middlewares: [],
				skipWaiting: false,
				precache: { routes: [], eventType: false },
			});

			eventInstall(event, config);
			await waitUntilFn.mock.calls[0].arguments[0];

			equal(skipWaitingFn.mock.callCount(), 0);

			globalThis.skipWaiting = originalSkipWaiting;
		},
	);

	await t.test(
		"eventInstall: should postMessage when eventType is set",
		async () => {
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };

			const originalSkipWaiting = globalThis.skipWaiting;
			globalThis.skipWaiting = mock.fn();

			const postMessageFn = mock.fn();
			const config = compileConfig({
				middlewares: [],
				precache: {
					routes: [],
					eventType: "install-done",
					postMessage: postMessageFn,
				},
			});

			eventInstall(event, config);
			await waitUntilFn.mock.calls[0].arguments[0];

			equal(postMessageFn.mock.callCount(), 1);
			deepEqual(postMessageFn.mock.calls[0].arguments[0], {
				type: "install-done",
			});

			globalThis.skipWaiting = originalSkipWaiting;
		},
	);

	await t.test("eventInstall: should fetch precache routes", async () => {
		const waitUntilFn = mock.fn();
		const event = { waitUntil: waitUntilFn };

		const originalSkipWaiting = globalThis.skipWaiting;
		globalThis.skipWaiting = mock.fn();

		const putFn = mock.fn();
		cacheStore["sw-default"] = { put: putFn, match: () => undefined };

		const config = compileConfig({
			middlewares: [],
			precache: {
				routes: [{ path: "http://localhost:8080/200" }],
				eventType: false,
			},
		});

		eventInstall(event, config);
		await waitUntilFn.mock.calls[0].arguments[0];

		// The precache route must actually be fetched + cached: /200 carries
		// max-age so strategyNetworkFirst writes it. A no-op map (mutated body)
		// would never reach the network/cache, so put would stay at 0.
		equal(putFn.mock.callCount(), 1);
		equal(putFn.mock.calls[0].arguments[0], "http://localhost:8080/200");

		delete cacheStore["sw-default"];
		globalThis.skipWaiting = originalSkipWaiting;
	});

	await t.test(
		"eventInstall: precaches assets regardless of their HTTP freshness",
		async (tt) => {
			// Precache freshness is owned by the SW version (cachePrefix), not by
			// Cache-Control: an offline page served with no max-age must still land.
			tt.mock.method(globalThis, "fetch", async () => new Response("offline"));
			const originalSkipWaiting = globalThis.skipWaiting;
			globalThis.skipWaiting = mock.fn();
			tt.after(() => {
				globalThis.skipWaiting = originalSkipWaiting;
			});
			const waitUntilFn = mock.fn();
			const config = compileConfig({
				cacheName: "precache-fresh",
				precache: { routes: ["http://localhost:8080/offline.html"] },
			});

			eventInstall({ waitUntil: waitUntilFn }, config);
			await waitUntilFn.mock.calls[0].arguments[0];

			const cached = await caches.match(
				new Request("http://localhost:8080/offline.html"),
				{ cacheName: "sw-precache-fresh" },
			);
			equal(await cached?.text(), "offline");
			await caches.delete("sw-precache-fresh");
		},
	);

	await t.test(
		"eventInstall: fails install and caches nothing when a precache entry fails",
		async (tt) => {
			// A resolving install would let activate purge the previous version's
			// caches while this version is missing assets.
			const fetchMock = tt.mock.method(
				globalThis,
				"fetch",
				async () => new Response("missing", { status: 404 }),
			);
			const originalSkipWaiting = globalThis.skipWaiting;
			globalThis.skipWaiting = mock.fn();
			tt.after(() => {
				globalThis.skipWaiting = originalSkipWaiting;
			});
			const waitUntilFn = mock.fn();
			const config = compileConfig({
				cacheName: "precache-404",
				precache: { routes: ["http://localhost:8080/missing.html"] },
			});

			eventInstall({ waitUntil: waitUntilFn }, config);
			await rejects(waitUntilFn.mock.calls[0].arguments[0], (e) => {
				match(e.message, /precache: .*missing\.html.*404/);
				strictEqual(e.cause.status, 404);
				return true;
			});

			// A network failure (Error, not Response) fails install too.
			fetchMock.mock.mockImplementation(async () => {
				throw new Error("offline");
			});
			eventInstall({ waitUntil: waitUntilFn }, config);
			await rejects(waitUntilFn.mock.calls[1].arguments[0]);

			deepEqual(
				await caches.keys().then((k) => k.includes("sw-precache-404")),
				false,
			);
		},
	);

	await t.test(
		"eventInstall: string routes without `extract` fails with an actionable error",
		async () => {
			// Parsing a remote route manifest is format-specific, so core ships no
			// default. Without an explicit `extract` the caller should be told what
			// to install, not get `TypeError: extract is not a function`.
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };

			const originalSkipWaiting = globalThis.skipWaiting;
			globalThis.skipWaiting = mock.fn();

			const config = compileConfig({
				middlewares: [],
				precache: { routes: [], eventType: false },
			});
			config.precache.routes = "http://localhost:8080/precache.json";

			eventInstall(event, config);
			await rejects(
				async () => await waitUntilFn.mock.calls[0].arguments[0],
				(e) =>
					e instanceof TypeError &&
					e.message ===
						"precache: `extract` is required when `routes` is a URL. " +
							"Install @work-bee/precache-json and pass `extract: precacheExtractJSON`, " +
							"or supply your own (response) => Route[].",
			);

			globalThis.skipWaiting = originalSkipWaiting;
		},
	);

	await t.test(
		"eventInstall: should fetch string routes URL and extract",
		async () => {
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };

			const originalSkipWaiting = globalThis.skipWaiting;
			globalThis.skipWaiting = mock.fn();

			const putFn = mock.fn();
			cacheStore["sw-default"] = { put: putFn, match: () => undefined };

			// compileConfig doesn't support string routes, so compile first then override
			const config = compileConfig({
				middlewares: [],
				precache: {
					routes: [],
					eventType: false,
				},
			});
			// Override precache routes to string URL (runtime feature)
			config.precache.routes = "http://localhost:8080/200";
			config.precache.extract = (_response) => {
				// Extracted routes must have middleware arrays like compiled routes
				return [
					{
						path: "http://localhost:8080/200",
						before: [],
						beforeNetwork: [],
						afterNetwork: [],
						after: [],
						strategy: strategyNetworkFirst,
						cacheKey: "sw-default",
					},
				];
			};

			eventInstall(event, config);
			await waitUntilFn.mock.calls[0].arguments[0];

			globalThis.skipWaiting = originalSkipWaiting;
		},
	);

	await t.test(
		"eventInstall->eventActivate: string precache.routes is compiled back so activate does not crash",
		async () => {
			// H1: eventInstall must write the compiled routes back onto
			// config.precache.routes; otherwise eventActivate calls
			// `precache.routes.concat(...)` on a String and throws.
			const installWaitUntil = mock.fn();
			const installEvent = { waitUntil: installWaitUntil };

			const originalSkipWaiting = globalThis.skipWaiting;
			globalThis.skipWaiting = mock.fn();

			const putFn = mock.fn();
			cacheStore["sw-default"] = { put: putFn, match: () => undefined };

			const config = compileConfig({
				middlewares: [],
				precache: { routes: [], eventType: false },
				activate: { eventType: false },
			});
			config.precache.routes = "http://localhost:8080/200";
			config.precache.cacheKey = "sw-precache";
			config.precache.extract = () => [
				{
					path: "http://localhost:8080/200",
					before: [],
					beforeNetwork: [],
					afterNetwork: [],
					after: [],
					strategy: strategyNetworkFirst,
					cacheKey: "sw-precache",
				},
			];

			eventInstall(installEvent, config);
			await installWaitUntil.mock.calls[0].arguments[0];

			// After install, the string must be replaced by the compiled array.
			strictEqual(Array.isArray(config.precache.routes), true);

			// Now activate the SAME config. Previously this threw
			// "routes.concat is not a function" / "...map is not a function".
			const activateWaitUntil = mock.fn();
			const activateEvent = { waitUntil: activateWaitUntil };

			const originalClients = globalThis.clients;
			globalThis.clients = {
				...globalThis.clients,
				claim: mock.fn(() => Promise.resolve()),
			};
			const originalKeys = globalThis.caches.keys;
			const originalDelete = globalThis.caches.delete;
			const deletedKeys = [];
			globalThis.caches.keys = () =>
				Promise.resolve(["sw-precache", "sw-default", "sw-stale"]);
			globalThis.caches.delete = mock.fn((key) => {
				deletedKeys.push(key);
				return Promise.resolve();
			});

			eventActivate(activateEvent, config);
			// Must RESOLVE (no throw) now that routes is an array.
			await Promise.all(
				activateWaitUntil.mock.calls.map((c) => c.arguments[0]),
			);

			// The precache cacheKey must be in the exclude set (not deleted).
			strictEqual(deletedKeys.includes("sw-precache"), false);
			strictEqual(deletedKeys.includes("sw-default"), false);
			// An unrelated cache is purged.
			strictEqual(deletedKeys.includes("sw-stale"), true);

			globalThis.skipWaiting = originalSkipWaiting;
			globalThis.clients = originalClients;
			globalThis.caches.keys = originalKeys;
			globalThis.caches.delete = originalDelete;
		},
	);

	// *** eventActivate *** //
	await t.test(
		"eventActivate: should call waitUntil and clients.claim",
		async () => {
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };

			const originalClients = globalThis.clients;
			const claimFn = mock.fn(() => Promise.resolve());
			globalThis.clients = {
				...globalThis.clients,
				claim: claimFn,
			};

			const originalKeys = globalThis.caches.keys;
			const originalDelete = globalThis.caches.delete;
			globalThis.caches.keys = () => Promise.resolve([]);
			globalThis.caches.delete = mock.fn(() => Promise.resolve());

			const config = compileConfig({
				middlewares: [],
				routes: [
					{
						methods: ["GET"],
						pathPattern: pathPattern("/api/.*$"),
						cacheName: "api",
					},
				],
				activate: { eventType: false },
			});

			eventActivate(event, config);

			equal(waitUntilFn.mock.callCount(), 2);

			// Wait for promises
			await Promise.all(waitUntilFn.mock.calls.map((c) => c.arguments[0]));

			globalThis.clients = originalClients;
			globalThis.caches.keys = originalKeys;
			globalThis.caches.delete = originalDelete;
		},
	);

	await t.test(
		"eventActivate: should postMessage when eventType is set",
		async () => {
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };

			const originalClients = globalThis.clients;
			globalThis.clients = {
				...globalThis.clients,
				claim: mock.fn(() => Promise.resolve()),
			};

			const originalKeys = globalThis.caches.keys;
			const originalDelete = globalThis.caches.delete;
			globalThis.caches.keys = () => Promise.resolve([]);
			globalThis.caches.delete = mock.fn(() => Promise.resolve());

			const postMessageFn = mock.fn();
			const config = compileConfig({
				middlewares: [],
				routes: [],
				activate: {
					eventType: "activate-done",
					postMessage: postMessageFn,
				},
			});

			eventActivate(event, config);
			await Promise.all(waitUntilFn.mock.calls.map((c) => c.arguments[0]));

			equal(postMessageFn.mock.callCount(), 1);
			deepEqual(postMessageFn.mock.calls[0].arguments[0], {
				type: "activate-done",
			});

			globalThis.clients = originalClients;
			globalThis.caches.keys = originalKeys;
			globalThis.caches.delete = originalDelete;
		},
	);

	await t.test(
		"eventActivate: exclude set is robust when precache.routes is not an array",
		async () => {
			// M4: a non-array precache.routes (e.g. an un-compiled string URL left
			// over from a failed/skipped install) must not crash activate, and the
			// exclude set must still seed both the base and precache cacheKeys so
			// neither of those caches is purged.
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };

			const originalClients = globalThis.clients;
			globalThis.clients = {
				...globalThis.clients,
				claim: mock.fn(() => Promise.resolve()),
			};

			const originalKeys = globalThis.caches.keys;
			const originalDelete = globalThis.caches.delete;
			const deletedKeys = [];
			globalThis.caches.keys = () =>
				Promise.resolve(["sw-default", "sw-precache", "sw-orphan"]);
			globalThis.caches.delete = mock.fn((key) => {
				deletedKeys.push(key);
				return Promise.resolve();
			});

			const config = compileConfig({
				middlewares: [],
				routes: [],
				activate: { eventType: false },
			});
			// Simulate a leftover string URL that was never compiled back.
			config.precache.routes = "http://localhost:8080/precache.json";
			config.precache.cacheKey = "sw-precache";

			eventActivate(event, config);
			// Must RESOLVE rather than throw "routes.concat is not a function".
			await Promise.all(waitUntilFn.mock.calls.map((c) => c.arguments[0]));

			strictEqual(deletedKeys.includes("sw-default"), false);
			strictEqual(deletedKeys.includes("sw-precache"), false);
			strictEqual(deletedKeys.includes("sw-orphan"), true);

			globalThis.clients = originalClients;
			globalThis.caches.keys = originalKeys;
			globalThis.caches.delete = originalDelete;
		},
	);

	await t.test(
		"eventActivate: keeps caches for every configured route (route cacheKeys are excluded)",
		async () => {
			// Drives the `for (...) exclude.add(routeConfig.cacheKey)` loop: a route
			// with a UNIQUE cacheKey (sw-api, distinct from base/precache) must be
			// added to the keep-set. Emptying the loop body would let sw-api be
			// purged.
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };

			const originalClients = globalThis.clients;
			globalThis.clients = {
				...globalThis.clients,
				claim: mock.fn(() => Promise.resolve()),
			};

			const originalKeys = globalThis.caches.keys;
			const originalDelete = globalThis.caches.delete;
			const deletedKeys = [];
			globalThis.caches.keys = () =>
				Promise.resolve(["sw-default", "sw-api", "sw-orphan"]);
			globalThis.caches.delete = mock.fn((key) => {
				deletedKeys.push(key);
				return Promise.resolve();
			});

			const config = compileConfig({
				middlewares: [],
				routes: [
					{
						methods: ["GET"],
						pathPattern: pathPattern("/api/.*$"),
						cacheName: "api",
					},
				],
				activate: { eventType: false },
			});
			// Sanity: the route compiled to a distinct cacheKey.
			strictEqual(config.routes[0].cacheKey, "sw-api");

			eventActivate(event, config);
			await Promise.all(waitUntilFn.mock.calls.map((c) => c.arguments[0]));

			// The configured route's cache must survive (added to exclude by the
			// loop); only the unrelated cache is purged.
			strictEqual(deletedKeys.includes("sw-api"), false);
			strictEqual(deletedKeys.includes("sw-default"), false);
			strictEqual(deletedKeys.includes("sw-orphan"), true);

			globalThis.clients = originalClients;
			globalThis.caches.keys = originalKeys;
			globalThis.caches.delete = originalDelete;
		},
	);

	await t.test(
		"eventActivate: only purges caches carrying a configured cachePrefix",
		async () => {
			// CacheStorage is shared by the whole origin: page code and service
			// workers on other scopes own caches too. Activate may only reap caches
			// that workbee itself could have created.
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };

			const originalClients = globalThis.clients;
			globalThis.clients = {
				...globalThis.clients,
				claim: mock.fn(() => Promise.resolve()),
			};
			for (const key of [
				"sw-default",
				"sw-old",
				"v2-api",
				"v1-api",
				"app-owned-data",
				"other-scope-sw",
			]) {
				await caches.open(key);
			}

			const config = compileConfig({
				routes: [
					{
						pathPattern: pathPattern("/api/.*$"),
						cachePrefix: "v2-",
						cacheName: "api",
					},
				],
			});

			eventActivate(event, config);
			await Promise.all(waitUntilFn.mock.calls.map((c) => c.arguments[0]));

			deepEqual((await caches.keys()).sort(), [
				"app-owned-data",
				"other-scope-sw",
				"sw-default",
				"v1-api",
				"v2-api",
			]);

			for (const key of await caches.keys()) await caches.delete(key);
			globalThis.clients = originalClients;
		},
	);

	await t.test(
		"eventActivate: reaps stale caches under a route's own cachePrefix",
		async (tt) => {
			const waitUntilFn = mock.fn();
			const originalClients = globalThis.clients;
			globalThis.clients = { claim: mock.fn(() => Promise.resolve()) };
			tt.after(async () => {
				globalThis.clients = originalClients;
				for (const key of await caches.keys()) await caches.delete(key);
			});
			for (const key of ["v2-api", "v2-stale", "app-owned-data"]) {
				await caches.open(key);
			}

			const config = compileConfig({
				routes: [
					{
						pathPattern: pathPattern("/api/.*$"),
						cachePrefix: "v2-",
						cacheName: "api",
					},
				],
			});

			eventActivate({ waitUntil: waitUntilFn }, config);
			await Promise.all(waitUntilFn.mock.calls.map((c) => c.arguments[0]));

			deepEqual((await caches.keys()).sort(), ["app-owned-data", "v2-api"]);
		},
	);

	await t.test(
		"eventActivate: keeps caches used by strategyPartition sub-routes",
		async (tt) => {
			const { strategyHTMLPartition } = await import("../index.js");
			const waitUntilFn = mock.fn();
			const originalClients = globalThis.clients;
			globalThis.clients = { claim: mock.fn(() => Promise.resolve()) };
			tt.after(async () => {
				globalThis.clients = originalClients;
				for (const key of await caches.keys()) await caches.delete(key);
			});
			for (const key of ["sw-fragments", "sw-shell", "sw-orphan"]) {
				await caches.open(key);
			}

			const config = compileConfig({
				// top-level strategy and a route strategy are both partitions
				strategy: strategyHTMLPartition(
					compileConfig({ cacheName: "shell", routes: [{ path: "$1/s" }] }),
				),
				routes: [
					{
						pathPattern: pathPattern("/page/.*$"),
						strategy: strategyHTMLPartition(
							compileConfig({
								cacheName: "fragments",
								routes: [{ path: "$1/header" }],
							}),
						),
					},
				],
			});

			eventActivate({ waitUntil: waitUntilFn }, config);
			await Promise.all(waitUntilFn.mock.calls.map((c) => c.arguments[0]));

			deepEqual((await caches.keys()).sort(), ["sw-fragments", "sw-shell"]);
		},
	);

	await t.test(
		"eventActivate: activate.purgePrefixes reaps previous-version caches",
		async () => {
			// Versioned prefixes (`sw-2-`) can't be derived from the old version, so
			// the stable part is opted in explicitly.
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };
			const originalClients = globalThis.clients;
			globalThis.clients = {
				...globalThis.clients,
				claim: mock.fn(() => Promise.resolve()),
			};
			for (const key of ["sw-1-default", "sw-2-default", "app-owned-data"]) {
				await caches.open(key);
			}

			const config = compileConfig({
				cachePrefix: "sw-2-",
				activate: { purgePrefixes: ["sw-"] },
			});

			eventActivate(event, config);
			await Promise.all(waitUntilFn.mock.calls.map((c) => c.arguments[0]));

			deepEqual((await caches.keys()).sort(), [
				"app-owned-data",
				"sw-2-default",
			]);

			for (const key of await caches.keys()) await caches.delete(key);
			globalThis.clients = originalClients;
		},
	);

	await t.test(
		"eventActivate: a partial activate config keeps the default postMessage",
		async () => {
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };
			const originalClients = globalThis.clients;
			const posted = [];
			globalThis.clients = {
				claim: () => Promise.resolve(),
				matchAll: async () => [{ postMessage: (m) => posted.push(m) }],
			};

			const config = compileConfig({ activate: { eventType: "activated" } });
			eventActivate(event, config);
			await Promise.all(waitUntilFn.mock.calls.map((c) => c.arguments[0]));

			deepEqual(posted, [{ type: "activated" }]);
			globalThis.clients = originalClients;
		},
	);

	// *** eventFetch *** //
	await t.test(
		"eventFetch: should reject respondWith promise when strategy throws",
		async () => {
			let capturedPromise;
			const request = new Request("http://localhost:8080/test", {
				method: "GET",
			});
			const event = {
				request,
				respondWith: (p) => {
					capturedPromise = p;
				},
				waitUntil: mock.fn(),
			};

			const err = new Error("strategy boom");
			const config = compileConfig({
				middlewares: [],
				strategy: () => {
					throw err;
				},
				routes: [],
			});

			eventFetch(event, config);

			let caught;
			try {
				await capturedPromise;
			} catch (e) {
				caught = e;
			}
			// Previously resolved with an Error object; now the promise rejects.
			deepEqual(caught, err);
		},
	);

	await t.test("eventFetch: should call respondWith", async () => {
		const respondWithFn = mock.fn();
		const request = new Request("http://localhost:8080/200", {
			method: "GET",
		});
		const event = {
			request,
			respondWith: respondWithFn,
			waitUntil: mock.fn(),
		};

		const putFn = mock.fn();
		cacheStore["sw-default"] = { put: putFn, match: () => undefined };

		const config = compileConfig({
			middlewares: [],
			strategy: strategyNetworkOnly,
			routes: [],
			// The bare default proxy would otherwise bypass respondWith.
			passthrough: false,
		});

		eventFetch(event, config);

		equal(respondWithFn.mock.callCount(), 1);
		const response = await respondWithFn.mock.calls[0].arguments[0];
		equal(response.status, 200);
	});

	await t.test(
		"eventFetch: skips respondWith when no route matches and the config is the bare default proxy",
		async () => {
			const respondWithFn = mock.fn();
			const event = {
				request: new Request("http://localhost:8080/200", { method: "GET" }),
				respondWith: respondWithFn,
				waitUntil: mock.fn(),
			};

			const config = compileConfig({ routes: [] });
			eventFetch(event, config);

			// Unmatched + passthrough-eligible: the browser handles it natively.
			equal(respondWithFn.mock.callCount(), 0);
		},
	);

	await t.test(
		"eventFetch: calls respondWith when a route matches even when passthrough is enabled",
		async () => {
			const respondWithFn = mock.fn();
			const event = {
				request: new Request("http://localhost:8080/200", { method: "GET" }),
				respondWith: respondWithFn,
				waitUntil: mock.fn(),
			};

			const config = compileConfig({
				routes: [{ pathPattern: /200$/, methods: ["GET"] }],
			});
			eventFetch(event, config);

			equal(respondWithFn.mock.callCount(), 1);
			const response = await respondWithFn.mock.calls[0].arguments[0];
			equal(response.status, 200);
		},
	);

	// *** backgroundFetchSuccessEvent *** //
	await t.test(
		"backgroundFetchSuccessEvent: stores every fetched record in its route's cache before announcing it",
		async (tt) => {
			const posted = [];
			const originalBroadcastChannel = globalThis.BroadcastChannel;
			globalThis.BroadcastChannel = class {
				postMessage = (m) => posted.push(m);
				close() {}
			};
			tt.after(() => {
				globalThis.BroadcastChannel = originalBroadcastChannel;
			});
			const config = compileConfig({
				cacheName: "bgf",
				routes: [{ pathPattern: /\/media\//, cacheName: "media" }],
			});
			const record = (url, body) => ({
				request: new Request(url),
				responseReady: Promise.resolve(new Response(body)),
			});
			const waitUntils = [];
			backgroundFetchSuccessEvent(
				{
					waitUntil: (p) => waitUntils.push(p),
					registration: {
						id: "podcast",
						matchAll: async () => [
							record("http://localhost:8080/media/ep1.mp3", "ep1"),
							record("http://localhost:8080/ep1.json", "meta"),
						],
					},
				},
				config,
			);
			await Promise.all(waitUntils);

			const media = await caches.match(
				new Request("http://localhost:8080/media/ep1.mp3"),
				{ cacheName: "sw-media" },
			);
			equal(await media?.text(), "ep1");
			const meta = await caches.match(
				new Request("http://localhost:8080/ep1.json"),
				{ cacheName: "sw-bgf" },
			);
			equal(await meta?.text(), "meta");
			deepEqual(posted, [{ stored: true }]);
			await caches.delete("sw-media");
			await caches.delete("sw-bgf");
		},
	);

	await t.test(
		"backgroundFetchSuccessEvent: skips records the strategies would not cache",
		async (tt) => {
			// A 206 or `Vary: *` makes cache.put reject (losing the broadcast);
			// a `Vary: Cookie` entry would be served to every user.
			const posted = [];
			const originalBroadcastChannel = globalThis.BroadcastChannel;
			globalThis.BroadcastChannel = class {
				postMessage = (m) => posted.push(m);
				close() {}
			};
			tt.after(() => {
				globalThis.BroadcastChannel = originalBroadcastChannel;
			});
			const config = compileConfig({ cacheName: "bgf-skip" });
			const record = (path, init) => ({
				request: new Request(`http://localhost:8080${path}`),
				responseReady: Promise.resolve(new Response(path, init)),
			});
			const waitUntils = [];
			backgroundFetchSuccessEvent(
				{
					waitUntil: (p) => waitUntils.push(p),
					registration: {
						id: "skip",
						matchAll: async () => [
							record("/ok"),
							record("/partial", { status: 206 }),
							record("/star", { headers: { Vary: "*" } }),
							record("/cookie", { headers: { Vary: "Cookie" } }),
						],
					},
				},
				config,
			);
			await Promise.all(waitUntils);

			const stored = async (path) =>
				(await caches.match(new Request(`http://localhost:8080${path}`), {
					cacheName: "sw-bgf-skip",
				})) instanceof Response;
			equal(await stored("/ok"), true);
			equal(await stored("/partial"), false);
			equal(await stored("/star"), false);
			equal(await stored("/cookie"), false);
			deepEqual(posted, [{ stored: true }]);
			await caches.delete("sw-bgf-skip");
		},
	);

	await t.test(
		"backgroundFetchSuccessEvent: should call waitUntil",
		async () => {
			const waitUntilFn = mock.fn();
			const postMessageFn = mock.fn();
			const closeFn = mock.fn();

			const originalBroadcastChannel = globalThis.BroadcastChannel;
			globalThis.BroadcastChannel = class {
				constructor(id) {
					this.id = id;
				}
				postMessage = postMessageFn;
				close = closeFn;
			};

			const event = {
				waitUntil: waitUntilFn,
				registration: { id: "test-fetch", matchAll: async () => [] },
			};

			backgroundFetchSuccessEvent(event, compileConfig());
			equal(waitUntilFn.mock.callCount(), 1);
			await waitUntilFn.mock.calls[0].arguments[0];

			equal(postMessageFn.mock.callCount(), 1);
			deepEqual(postMessageFn.mock.calls[0].arguments[0], { stored: true });
			// The channel handle must be released once the message is queued.
			equal(closeFn.mock.callCount(), 1);

			globalThis.BroadcastChannel = originalBroadcastChannel;
		},
	);

	await t.test(
		"eventInstall: wraps fetch failure with a clearer message",
		async () => {
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };
			const originalSkipWaiting = globalThis.skipWaiting;
			globalThis.skipWaiting = mock.fn();

			const config = compileConfig({
				middlewares: [],
				precache: {
					routes: "http://localhost:8080/offline",
					// Present so the guard passes and the fetch-failure path is what
					// this test actually exercises; it never runs.
					extract: async () => [],
					eventType: false,
				},
			});

			eventInstall(event, config);
			let caught;
			try {
				await waitUntilFn.mock.calls[0].arguments[0];
			} catch (e) {
				caught = e;
			}
			globalThis.skipWaiting = originalSkipWaiting;
			strictEqual(caught instanceof Error, true);
			strictEqual(/precache/i.test(caught.message), true);
			strictEqual(/failed to fetch/i.test(caught.message), true);
			// The underlying failure is preserved as the cause (the `{ cause }` arm
			// of the unwrapped-Error rethrow).
			strictEqual(caught.cause instanceof Error, true);
			strictEqual(/offline/.test(caught.cause.message), true);
		},
	);

	await t.test(
		"eventInstall: a precache strategy that yields no Response fails with the precache message",
		async () => {
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };
			const originalSkipWaiting = globalThis.skipWaiting;
			globalThis.skipWaiting = mock.fn();

			const config = compileConfig({
				middlewares: [],
				precache: {
					routes: [{ path: "http://localhost:8080/missing" }],
					strategy: async () => undefined,
					eventType: false,
				},
			});

			eventInstall(event, config);
			await rejects(
				waitUntilFn.mock.calls[0].arguments[0],
				/precache: failed to fetch "http:\/\/localhost:8080\/missing"/,
			);
			globalThis.skipWaiting = originalSkipWaiting;
		},
	);

	await t.test(
		"eventInstall: wraps extract() error with a clearer message",
		async () => {
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };
			const originalSkipWaiting = globalThis.skipWaiting;
			globalThis.skipWaiting = mock.fn();

			const config = compileConfig({
				middlewares: [],
				precache: {
					routes: "http://localhost:8080/200",
					extract: () => {
						throw new Error("boom");
					},
					eventType: false,
				},
			});

			eventInstall(event, config);
			let caught;
			try {
				await waitUntilFn.mock.calls[0].arguments[0];
			} catch (e) {
				caught = e;
			}
			globalThis.skipWaiting = originalSkipWaiting;
			strictEqual(caught instanceof Error, true);
			strictEqual(/precache/i.test(caught.message), true);
			strictEqual(/extract/i.test(caught.message), true);
			// The thrown extract() error is preserved as the cause (its `{ cause }`).
			strictEqual(caught.cause instanceof Error, true);
			strictEqual(/boom/.test(caught.cause.message), true);
		},
	);

	await t.test(
		"eventInstall: wraps a rejecting waitUntil during the source fetch (L17 reject path)",
		async () => {
			// L17: fetchStrategy never rejects for hook/strategy errors, but
			// fetchInlineStrategy still rejects when one of its waitUntil promises
			// rejects (e.g. a non-quota cachePut failure). That rejection must be
			// caught and rewrapped with a precache-specific message.
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };
			const originalSkipWaiting = globalThis.skipWaiting;
			globalThis.skipWaiting = mock.fn();

			// Cacheable 200 → strategyNetworkFirst queues cachePut in waitUntil.
			// Make the underlying put reject (non-quota) so cachePut rethrows and
			// fetchInlineStrategy's Promise.all(waitUntils) rejects.
			cacheStore["sw-default"] = {
				put: () => Promise.reject(new Error("disk full")),
				match: () => undefined,
			};

			const config = compileConfig({
				middlewares: [],
				precache: {
					routes: "http://localhost:8080/cache-control/max-age=86400",
					// extract would otherwise run after the fetch resolves; with the
					// rejecting waitUntil we never reach it.
					extract: () => [],
					eventType: false,
				},
			});

			eventInstall(event, config);
			let caught;
			try {
				await waitUntilFn.mock.calls[0].arguments[0];
			} catch (e) {
				caught = e;
			}
			globalThis.skipWaiting = originalSkipWaiting;
			delete cacheStore["sw-default"];

			strictEqual(caught instanceof Error, true);
			strictEqual(/precache/i.test(caught.message), true);
			strictEqual(/failed to fetch/i.test(caught.message), true);
			// The original rejection is preserved as the cause.
			strictEqual(caught.cause instanceof Error, true);
			strictEqual(/disk full/.test(caught.cause.message), true);
		},
	);

	// *** backgroundFetchFailEvent *** //
	await t.test(
		"backgroundFetchFailEvent: should log the event via consoleError",
		(tt) => {
			// The handler's whole job is to surface the failure: it must call
			// consoleError (→ console.error) with the event. An empty body would log
			// nothing.
			const errorSpy = tt.mock.method(console, "error", () => {});
			const failEvent = { message: "fail" };
			backgroundFetchFailEvent(failEvent);
			equal(errorSpy.mock.callCount(), 1);
			strictEqual(errorSpy.mock.calls[0].arguments[0], failEvent);
		},
	);

	// *** fetchInlineStrategy event accessor propagation *** //
	await t.test(
		"fetchInlineStrategy: preserves accessor-defined event properties",
		async () => {
			const originalRequest = new Request("http://localhost:8080/accessor");
			// FetchEvent in real browsers exposes request/clientId/etc. as
			// accessors (no enumerable own properties). Simulate that shape so
			// the test fails if the implementation uses `{...event}` spread.
			const eventProto = {};
			Object.defineProperty(eventProto, "request", {
				get() {
					return originalRequest;
				},
			});
			const fetchEvent = Object.create(eventProto);

			let seenRequest;
			const strategy = (_request, evt) => {
				seenRequest = evt.request;
				return new Response("ok", { status: 200 });
			};
			const config = compileConfig({
				middlewares: [],
				strategy,
				routes: [],
			});

			await fetchInlineStrategy(originalRequest, fetchEvent, config);

			strictEqual(seenRequest, originalRequest);
		},
	);

	await t.test(
		"fetchInlineStrategy: exposes waitUntil as an enumerable own property on the inline event",
		async () => {
			// The inline event defines waitUntil with `enumerable: true` so it
			// survives a `{ ...event }` spread by downstream code (the same reason
			// the inherited accessors are preserved). Capture the inline event and
			// assert the descriptor is enumerable.
			let seenEvent;
			const strategy = (_request, evt) => {
				seenEvent = evt;
				return new Response("ok", { status: 200 });
			};
			const config = compileConfig({ middlewares: [], strategy, routes: [] });
			const outerEvent = {};

			await fetchInlineStrategy(
				new Request("http://localhost:8080/enum"),
				outerEvent,
				config,
			);

			strictEqual(typeof seenEvent.waitUntil, "function");
			strictEqual(
				Object.prototype.propertyIsEnumerable.call(seenEvent, "waitUntil"),
				true,
			);
			// And it is visible to enumeration / spread.
			strictEqual(Object.keys(seenEvent).includes("waitUntil"), true);
		},
	);

	// *** setupMocks cleanup *** //
	await t.test(
		"setupMocks: returns a cleanup fn that restores cacheStore",
		async () => {
			const { setupMocks } = await import("../../../fixtures/helper.js");
			delete cacheStore["sw-default"];
			const { cleanup } = setupMocks();
			strictEqual("sw-default" in cacheStore, true);
			cleanup();
			strictEqual("sw-default" in cacheStore, false);
		},
	);

	await t.test(
		"setupMocks: auto-registers cleanup when given a test context",
		async (tt) => {
			const { setupMocks } = await import("../../../fixtures/helper.js");
			delete cacheStore["sw-default"];
			let inner;
			await tt.test("inner", async (iTT) => {
				setupMocks(undefined, undefined, iTT);
				inner = cacheStore["sw-default"];
				strictEqual(!!inner, true);
			});
			// Inner test finished → its t.after() should have fired.
			strictEqual(cacheStore["sw-default"], undefined);
		},
	);

	// *** cacheOverrideEvent *** //
	await t.test(
		"cacheOverrideEvent: should throw when allowedOrigins is not provided",
		async () => {
			const config = compileConfig({ middlewares: [], routes: [] });
			let caught;
			try {
				cacheOverrideEvent(config);
			} catch (e) {
				caught = e;
			}
			strictEqual(caught instanceof Error, true);
			strictEqual(/allowedOrigins/.test(caught.message), true);
			// The message must state the limit honestly: a SW only receives
			// same-origin client messages, so this is not a cross-origin defence.
			strictEqual(/same-origin/.test(caught.message), true);
			strictEqual(/cache poisoning/.test(caught.message), false);
		},
	);

	await t.test(
		"cacheOverrideEvent: should throw when allowedOrigins is an empty array",
		async () => {
			// An empty array is an array but carries no trusted origins, so the
			// length===0 arm of the guard must still reject it.
			const config = compileConfig({ middlewares: [], routes: [] });
			let caught;
			try {
				cacheOverrideEvent(config, { allowedOrigins: [] });
			} catch (e) {
				caught = e;
			}
			strictEqual(caught instanceof Error, true);
			strictEqual(/allowedOrigins/.test(caught.message), true);
		},
	);

	await t.test(
		"cacheOverrideEvent: handler ignores an undefined messageEvent without throwing",
		async (tt) => {
			// The `messageEvent?.source?.url` guard must tolerate a nullish event:
			// dropping `?.` on messageEvent would throw a TypeError here.
			const putFn = mock.fn();
			cacheStore["sw-default"] = { put: putFn };
			tt.after(() => delete cacheStore["sw-default"]);

			const config = compileConfig({ middlewares: [], routes: [] });
			const handler = cacheOverrideEvent(config, {
				allowedOrigins: ["http://localhost:8080"],
			});

			let caught;
			let result;
			try {
				result = await handler(undefined);
			} catch (e) {
				caught = e;
			}
			strictEqual(caught, undefined);
			strictEqual(result, undefined);
			equal(putFn.mock.callCount(), 0);
		},
	);

	await t.test(
		"cacheOverrideEvent: should put string request/response into cache",
		async (tt) => {
			const putFn = mock.fn();
			cacheStore["sw-default"] = { put: putFn };
			tt.after(() => delete cacheStore["sw-default"]);

			const config = compileConfig({ middlewares: [], routes: [] });
			const handler = cacheOverrideEvent(config, {
				allowedOrigins: ["http://localhost:8080"],
			});
			await handler({
				source: { url: "http://localhost:8080/page" },
				data: {
					request: "http://localhost:8080/test",
					response: "hello",
				},
			});
			equal(putFn.mock.callCount(), 1);
			equal(putFn.mock.calls[0].arguments[0], "http://localhost:8080/test");
			// The string body must be wrapped into the Response body, not dropped:
			// newResponse({ body: response }) — an empty object would yield "".
			const storedResponse = putFn.mock.calls[0].arguments[1];
			equal(await storedResponse.text(), "hello");
		},
	);

	await t.test(
		"cacheOverrideEvent: a string response carries the posted headers",
		async (tt) => {
			// Without headers a rendered HTML string would be served back as
			// text/plain and never render.
			const putFn = mock.fn();
			cacheStore["sw-default"] = { put: putFn };
			tt.after(() => delete cacheStore["sw-default"]);
			const handler = cacheOverrideEvent(compileConfig(), {
				allowedOrigins: ["http://localhost:8080"],
			});
			await handler({
				source: { url: "http://localhost:8080/page" },
				data: {
					request: "http://localhost:8080/rendered",
					response: "<h1>hi</h1>",
					headers: { "Content-Type": "text/html; charset=utf-8" },
				},
			});
			const stored = putFn.mock.calls[0].arguments[1];
			equal(stored.headers.get("Content-Type"), "text/html; charset=utf-8");
			equal(await stored.text(), "<h1>hi</h1>");
		},
	);

	await t.test(
		"cacheOverrideEvent: hands the cache write to messageEvent.waitUntil",
		async (tt) => {
			// On a real ExtendableMessageEvent the write must extend the event via
			// `waitUntil` so the worker is not killed mid-write; the same promise is
			// also returned to the caller.
			const putFn = mock.fn(() => Promise.resolve());
			cacheStore["sw-default"] = { put: putFn };
			tt.after(() => delete cacheStore["sw-default"]);

			const config = compileConfig({ middlewares: [], routes: [] });
			const handler = cacheOverrideEvent(config, {
				allowedOrigins: ["http://localhost:8080"],
			});
			const waitUntil = mock.fn();
			const returned = handler({
				source: { url: "http://localhost:8080/page" },
				waitUntil,
				data: { request: "http://localhost:8080/test", response: "hi" },
			});
			strictEqual(waitUntil.mock.callCount(), 1);
			strictEqual(waitUntil.mock.calls[0].arguments[0], returned);
			await returned;
			equal(putFn.mock.callCount(), 1);
		},
	);

	await t.test(
		"cacheOverrideEvent: invalid posted headers are swallowed, not thrown",
		async (tt) => {
			const putFn = mock.fn(() => Promise.resolve());
			cacheStore["sw-default"] = { put: putFn };
			tt.after(() => delete cacheStore["sw-default"]);
			const consoleErrorMock = tt.mock.method(console, "error", () => {});

			const config = compileConfig({ middlewares: [], routes: [] });
			const handler = cacheOverrideEvent(config, {
				allowedOrigins: ["http://localhost:8080"],
			});
			await handler({
				source: { url: "http://localhost:8080/page" },
				data: {
					request: "http://localhost:8080/test",
					response: "hi",
					headers: { "bad name": "x" },
				},
			});
			equal(putFn.mock.callCount(), 0);
			equal(consoleErrorMock.mock.callCount(), 1);
		},
	);

	await t.test(
		"cacheOverrideEvent: with allowedOrigins should reject cross-origin MessageEvent",
		async (tt) => {
			const putFn = mock.fn();
			cacheStore["sw-default"] = { put: putFn };
			tt.after(() => delete cacheStore["sw-default"]);

			const config = compileConfig({ middlewares: [], routes: [] });
			const handler = cacheOverrideEvent(config, {
				allowedOrigins: ["http://localhost:8080"],
			});
			await handler({
				source: { url: "https://evil.example.com/page" },
				data: {
					request: "http://localhost:8080/test",
					response: "attacker-payload",
				},
			});
			equal(putFn.mock.callCount(), 0);
		},
	);

	await t.test(
		"cacheOverrideEvent: with allowedOrigins should accept same-origin MessageEvent",
		async (tt) => {
			const putFn = mock.fn();
			cacheStore["sw-default"] = { put: putFn };
			tt.after(() => delete cacheStore["sw-default"]);

			const config = compileConfig({ middlewares: [], routes: [] });
			const handler = cacheOverrideEvent(config, {
				allowedOrigins: ["http://localhost:8080"],
			});
			await handler({
				source: { url: "http://localhost:8080/page" },
				data: {
					request: "http://localhost:8080/test",
					response: "trusted",
				},
			});
			equal(putFn.mock.callCount(), 1);
		},
	);

	await t.test(
		"cacheOverrideEvent: should handle Request/Response objects",
		async (tt) => {
			const putFn = mock.fn();
			cacheStore["sw-default"] = { put: putFn };
			tt.after(() => delete cacheStore["sw-default"]);

			const config = compileConfig({ middlewares: [], routes: [] });
			const request = new Request("http://localhost:8080/test");
			const response = new Response("body");
			const handler = cacheOverrideEvent(config, {
				allowedOrigins: ["http://localhost:8080"],
			});
			await handler({
				source: { url: "http://localhost:8080/page" },
				data: { request, response },
			});
			equal(putFn.mock.callCount(), 1);
			// A real Response must be cached as-is, NOT re-wrapped via newResponse
			// (which would only happen if `typeof response === 'string'` always
			// held). Re-wrapping a Response object as a body yields "[object
			// Response]", so the original "body" proves the branch was skipped.
			const storedResponse = putFn.mock.calls[0].arguments[1];
			equal(await storedResponse.text(), "body");
		},
	);

	await t.test(
		"cacheOverrideEvent: ignores MessageEvent with no data",
		async (tt) => {
			const putFn = mock.fn();
			cacheStore["sw-default"] = { put: putFn };
			tt.after(() => delete cacheStore["sw-default"]);

			const config = compileConfig({ middlewares: [], routes: [] });
			const handler = cacheOverrideEvent(config, {
				allowedOrigins: ["http://localhost:8080"],
			});
			// No `data` field — a real MessageEvent without a payload must be
			// dropped rather than treated as `messageEvent` itself.
			await handler({
				source: { url: "http://localhost:8080/page" },
				request: "http://localhost:8080/test",
				response: "attack",
			});
			equal(putFn.mock.callCount(), 0);
		},
	);

	await t.test(
		"cacheOverrideEvent: ignores MessageEvent with no source url",
		async (tt) => {
			// Covers the `messageEvent?.source?.url` guard: a message without a
			// usable source origin must be dropped before any URL parsing.
			const putFn = mock.fn();
			cacheStore["sw-default"] = { put: putFn };
			tt.after(() => delete cacheStore["sw-default"]);

			const config = compileConfig({ middlewares: [], routes: [] });
			const handler = cacheOverrideEvent(config, {
				allowedOrigins: ["http://localhost:8080"],
			});
			let caught;
			try {
				await handler({
					data: { request: "http://localhost:8080/test", response: "x" },
				});
			} catch (e) {
				caught = e;
			}
			strictEqual(caught, undefined);
			equal(putFn.mock.callCount(), 0);
		},
	);

	await t.test(
		"cacheOverrideEvent: ignores same-origin message with no usable request",
		async (tt) => {
			// L3: a same-origin payload that lacks a `request` (or carries a
			// non-string, non-Request value) must be dropped, not crash
			// findRouteConfig/cachePut on `undefined`.
			const putFn = mock.fn();
			cacheStore["sw-default"] = { put: putFn };
			tt.after(() => delete cacheStore["sw-default"]);

			const config = compileConfig({ middlewares: [], routes: [] });
			const handler = cacheOverrideEvent(config, {
				allowedOrigins: ["http://localhost:8080"],
			});

			let caught;
			try {
				await handler({
					source: { url: "http://localhost:8080/page" },
					data: { response: "orphan" },
				});
			} catch (e) {
				caught = e;
			}
			strictEqual(caught, undefined);
			equal(putFn.mock.callCount(), 0);
		},
	);
});
