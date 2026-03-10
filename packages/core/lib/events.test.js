/* global Request Response Headers */

import { deepEqual, equal } from "node:assert";
import { mock, test } from "node:test";
import "../../../test-unit/helper.js";
import {
	backgroundFetchFailEvent,
	backgroundFetchSuccessEvent,
	compileConfig,
	eventActivate,
	eventFetch,
	eventInstall,
	fetchStrategy,
	findRouteConfig,
	notificationClickEvent,
	openCaches,
	pathPattern,
	periodicSyncEvent,
	precacheExtractJSON,
	pushEvent,
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
			const result = precacheExtractJSON(response);
			deepEqual(result, []);
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
				routes: [],
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

	// *** periodicSyncEvent *** //
	await t.test("periodicSyncEvent: should be callable", () => {
		periodicSyncEvent({});
	});

	// *** pushEvent *** //
	await t.test("pushEvent: should be callable", () => {
		pushEvent({}, { init: () => {}, shutdown: () => {} });
	});

	// *** notificationClickEvent *** //
	await t.test("notificationClickEvent: should be callable", () => {
		notificationClickEvent({});
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

	// *** backgroundFetchFailEvent *** //
	await t.test("backgroundFetchFailEvent: should be callable", () => {
		// consoleError is bound at import time, just verify it doesn't throw
		backgroundFetchFailEvent({ message: "fail" });
	});
});
