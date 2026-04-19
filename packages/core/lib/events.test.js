/* global Request Response Headers */

import { deepEqual, equal, strictEqual } from "node:assert";
import { mock, test } from "node:test";
import "../../../fixtures/helper.js";
import {
	backgroundFetchFailEvent,
	backgroundFetchSuccessEvent,
	cacheOverrideEvent,
	compileConfig,
	eventActivate,
	eventFetch,
	eventInstall,
	fetchStrategy,
	findRouteConfig,
	openCaches,
	pathPattern,
	precacheExtractJSON,
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

	// *** precacheExtractJSON *** //
	await t.test(
		"precacheExtractJSON: should return parsed JSON for application/json response",
		async () => {
			const body = JSON.stringify([{ path: "/index.html" }]);
			const response = new Response(body, {
				headers: new Headers({ "Content-Type": "application/json" }),
			});
			const result = await precacheExtractJSON(response);
			deepEqual(result, [{ path: "/index.html" }]);
		},
	);

	await t.test(
		"precacheExtractJSON: should return empty array for non-JSON response",
		async () => {
			const response = new Response("<html></html>", {
				headers: new Headers({ "Content-Type": "text/html" }),
			});
			const result = await precacheExtractJSON(response);
			deepEqual(result, []);
		},
	);

	await t.test(
		"precacheExtractJSON: throws when JSON body is not an array",
		async () => {
			const response = new Response(JSON.stringify({ routes: ["/a"] }), {
				headers: new Headers({ "Content-Type": "application/json" }),
			});
			let caught;
			try {
				await precacheExtractJSON(response);
			} catch (e) {
				caught = e;
			}
			strictEqual(caught instanceof TypeError, true);
			strictEqual(/array/.test(caught.message), true);
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
		openCaches["sw-default"] = { put: putFn, match: () => undefined };

		const config = compileConfig({
			middlewares: [],
			precache: {
				routes: [{ path: "http://localhost:8080/200" }],
				eventType: false,
			},
		});

		eventInstall(event, config);
		await waitUntilFn.mock.calls[0].arguments[0];

		globalThis.skipWaiting = originalSkipWaiting;
	});

	await t.test(
		"eventInstall: string routes should default to precacheExtractJSON when extract is not provided",
		async () => {
			const waitUntilFn = mock.fn();
			const event = { waitUntil: waitUntilFn };

			const originalSkipWaiting = globalThis.skipWaiting;
			globalThis.skipWaiting = mock.fn();

			const originalFetch = globalThis.fetch;
			const fetchFn = mock.fn(() =>
				Promise.resolve(
					new Response("[]", {
						status: 200,
						headers: new Headers({
							"Content-Type": "application/json",
							Date: new Date().toString(),
						}),
					}),
				),
			);
			globalThis.fetch = fetchFn;

			const config = compileConfig({
				middlewares: [],
				precache: { routes: [], eventType: false },
			});
			config.precache.routes = "http://localhost:8080/precache.json";

			eventInstall(event, config);
			// Before the fix this rejects with TypeError: extract is not a function.
			await waitUntilFn.mock.calls[0].arguments[0];

			equal(fetchFn.mock.callCount() >= 1, true);

			globalThis.skipWaiting = originalSkipWaiting;
			globalThis.fetch = originalFetch;
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
			openCaches["sw-default"] = { put: putFn, match: () => undefined };

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
		openCaches["sw-default"] = { put: putFn, match: () => undefined };

		const config = compileConfig({
			middlewares: [],
			strategy: strategyNetworkOnly,
			routes: [],
		});

		eventFetch(event, config);

		equal(respondWithFn.mock.callCount(), 1);
		const response = await respondWithFn.mock.calls[0].arguments[0];
		equal(response.status, 200);
	});

	// *** backgroundFetchSuccessEvent *** //
	await t.test(
		"backgroundFetchSuccessEvent: should call waitUntil",
		async () => {
			const waitUntilFn = mock.fn();
			const postMessageFn = mock.fn();

			const originalBroadcastChannel = globalThis.BroadcastChannel;
			globalThis.BroadcastChannel = class {
				constructor(id) {
					this.id = id;
				}
				postMessage = postMessageFn;
			};

			const event = {
				waitUntil: waitUntilFn,
				registration: { id: "test-fetch" },
			};

			backgroundFetchSuccessEvent(event);
			equal(waitUntilFn.mock.callCount(), 1);
			await waitUntilFn.mock.calls[0].arguments[0];

			equal(postMessageFn.mock.callCount(), 1);
			deepEqual(postMessageFn.mock.calls[0].arguments[0], { stored: true });

			globalThis.BroadcastChannel = originalBroadcastChannel;
		},
	);

	// *** precacheExtractJSON *** //
	await t.test(
		"precacheExtractJSON: should return JSON for application/json response",
		async () => {
			const data = [{ path: "/index.html" }];
			const response = new Response(JSON.stringify(data), {
				headers: new Headers({ "Content-Type": "application/json" }),
			});
			const result = await precacheExtractJSON(response);
			deepEqual(result, data);
		},
	);

	await t.test(
		"precacheExtractJSON: should return empty array for non-JSON response",
		async () => {
			const response = new Response("<html></html>", {
				headers: new Headers({ "Content-Type": "text/html" }),
			});
			const result = await precacheExtractJSON(response);
			deepEqual(result, []);
		},
	);

	// *** backgroundFetchFailEvent *** //
	await t.test("backgroundFetchFailEvent: should be callable", () => {
		// consoleError is bound at import time, just verify it doesn't throw
		backgroundFetchFailEvent({ message: "fail" });
	});

	// *** setupMocks cleanup *** //
	await t.test(
		"setupMocks: returns a cleanup fn that restores openCaches",
		async () => {
			const { setupMocks } = await import("../../../fixtures/helper.js");
			delete openCaches["sw-default"];
			const { cleanup } = setupMocks();
			strictEqual("sw-default" in openCaches, true);
			cleanup();
			strictEqual("sw-default" in openCaches, false);
		},
	);

	await t.test(
		"setupMocks: auto-registers cleanup when given a test context",
		async (tt) => {
			const { setupMocks } = await import("../../../fixtures/helper.js");
			delete openCaches["sw-default"];
			let inner;
			await tt.test("inner", async (iTT) => {
				setupMocks(undefined, undefined, iTT);
				inner = openCaches["sw-default"];
				strictEqual(!!inner, true);
			});
			// Inner test finished → its t.after() should have fired.
			strictEqual(openCaches["sw-default"], undefined);
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
		},
	);

	await t.test(
		"cacheOverrideEvent: should put string request/response into cache",
		async (tt) => {
			const putFn = mock.fn();
			openCaches["sw-default"] = { put: putFn };
			tt.after(() => delete openCaches["sw-default"]);

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
		},
	);

	await t.test(
		"cacheOverrideEvent: with allowedOrigins should reject cross-origin MessageEvent",
		async (tt) => {
			const putFn = mock.fn();
			openCaches["sw-default"] = { put: putFn };
			tt.after(() => delete openCaches["sw-default"]);

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
			openCaches["sw-default"] = { put: putFn };
			tt.after(() => delete openCaches["sw-default"]);

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
			openCaches["sw-default"] = { put: putFn };
			tt.after(() => delete openCaches["sw-default"]);

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
		},
	);
});
