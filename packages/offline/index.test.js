/* global Request Response Headers */

import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";

import { strictEqual } from "node:assert";
import { mock, test } from "node:test";
import {
	cachesOverride,
	domain,
	fetchOverride,
} from "../../fixtures/helper.js";
import offlineMiddleware, {
	idbDeserializeRequest,
	idbSerializeRequest,
} from "./index.js";

// Mocks
Object.assign(global, { caches: cachesOverride, fetch: fetchOverride });

const createOffline = async (opts = {}) => {
	// Fresh IndexedDB for each test to avoid cross-contamination
	globalThis.indexedDB = new IDBFactory();
	const offline = offlineMiddleware({ pollDelay: 0, ...opts });
	// Give IndexedDB time to initialize
	await new Promise((resolve) => setTimeout(resolve, 50));
	return offline;
};

// *** idbSerializeRequest *** //

test("idbSerializeRequest: serializes a POST request with body and headers", async () => {
	const request = new Request(`${domain}/200`, {
		method: "POST",
		headers: new Headers({ "Content-Type": "application/json" }),
		body: JSON.stringify({ key: "value" }),
	});

	const serialized = await idbSerializeRequest(request);

	strictEqual(serialized.method, "POST");
	strictEqual(serialized.url, `${domain}/200`);
	strictEqual(serialized.body, '{"key":"value"}');
	strictEqual(serialized.headers["content-type"], "application/json");
});

test("idbSerializeRequest: preserves all headers (redaction is middleware responsibility)", async () => {
	const request = new Request(`${domain}/200`, {
		method: "POST",
		headers: new Headers({
			"Content-Type": "application/json",
			Authorization: "Bearer secret-token",
		}),
		body: JSON.stringify({ key: "value" }),
	});

	const serialized = await idbSerializeRequest(request);

	strictEqual(serialized.headers.authorization, "Bearer secret-token");
	strictEqual(serialized.headers["content-type"], "application/json");
});

test("idbSerializeRequest: serializes a GET request with no body", async () => {
	const request = new Request(`${domain}/200`, {
		method: "GET",
	});

	const serialized = await idbSerializeRequest(request);

	strictEqual(serialized.method, "GET");
	strictEqual(serialized.url, `${domain}/200`);
	strictEqual(serialized.body, null);
});

// *** idbDeserializeRequest *** //

test("idbDeserializeRequest: creates a Request from serialized data", () => {
	const data = {
		method: "POST",
		url: `${domain}/200`,
		headers: { "content-type": "application/json" },
		body: '{"key":"value"}',
	};

	const request = idbDeserializeRequest(data);

	strictEqual(request instanceof Request, true);
	strictEqual(request.method, "POST");
	strictEqual(request.url, `${domain}/200`);
	strictEqual(request.headers.get("content-type"), "application/json");
});

// *** Roundtrip *** //

test("idbSerializeRequest + idbDeserializeRequest: roundtrip preserves key properties", async () => {
	const original = new Request(`${domain}/200`, {
		method: "PUT",
		headers: new Headers({ "Content-Type": "text/plain" }),
		body: "hello world",
	});

	const serialized = await idbSerializeRequest(original);
	const restored = idbDeserializeRequest(serialized);

	strictEqual(restored.method, "PUT");
	strictEqual(restored.url, `${domain}/200`);
	strictEqual(restored.headers.get("content-type"), "text/plain");
	const restoredBody = await restored.text();
	strictEqual(restoredBody, "hello world");
});

// *** afterNetwork *** //

test("afterNetwork: skips GET requests and returns original response", async () => {
	const { afterNetwork, destroy } = await createOffline();
	const request = new Request(`${domain}/200`, { method: "GET" });
	const response = new Response("{}", { status: 200 });
	const event = { waitUntil: mock.fn() };

	const result = await afterNetwork(request, response, event, {});

	strictEqual(result, response);
	strictEqual(result.status, 200);
	destroy();
});

test("afterNetwork: skips successful POST responses", async () => {
	const { afterNetwork, destroy } = await createOffline();
	const request = new Request(`${domain}/200`, {
		method: "POST",
		body: "data",
	});
	const response = new Response("{}", { status: 200 });
	const event = { waitUntil: mock.fn() };

	const result = await afterNetwork(request, response, event, {});

	strictEqual(result, response);
	strictEqual(result.status, 200);
	destroy();
});

test("afterNetwork: enqueues failed POST (503) and returns 202", async () => {
	const { afterNetwork, destroy } = await createOffline();
	const request = new Request(`${domain}/503`, {
		method: "POST",
		body: "data",
	});
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };

	const result = await afterNetwork(request, response, event, {});

	strictEqual(result.status, 202);
	strictEqual(waitUntils.length, 1);
	await Promise.all(waitUntils);
	destroy();
});

test("afterNetwork: enqueues network error POST and returns 202", async () => {
	const { afterNetwork, destroy } = await createOffline();
	const request = new Request(`${domain}/200`, {
		method: "POST",
		body: "data",
	});
	// Network error results in non-Response value (e.g. undefined or error)
	const response = undefined;
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };

	const result = await afterNetwork(request, response, event, {});

	strictEqual(result.status, 202);
	strictEqual(waitUntils.length, 1);
	await Promise.all(waitUntils);
	destroy();
});

// *** enqueueEventType postMessage (lines 92-93) *** //

test("afterNetwork: calls postMessage with enqueueEventType when enqueuing", async () => {
	const postMessageSpy = mock.fn();
	const { afterNetwork, destroy } = await createOffline({
		enqueueEventType: "enqueue",
		postMessage: postMessageSpy,
	});
	const request = new Request(`${domain}/503`, {
		method: "POST",
		body: JSON.stringify({ data: "test" }),
		headers: { "Content-Type": "application/json" },
	});
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };

	const result = await afterNetwork(request, response, event, {});
	await Promise.all(waitUntils);

	strictEqual(result.status, 202);
	strictEqual(postMessageSpy.mock.callCount(), 1);
	strictEqual(postMessageSpy.mock.calls[0].arguments[0].type, "enqueue");
	strictEqual(postMessageSpy.mock.calls[0].arguments[0].method, "POST");
	destroy();
});

// *** redactHeaders *** //

test("afterNetwork: strips authorization header by default when enqueuing", async () => {
	const postMessageSpy = mock.fn();
	const { afterNetwork, destroy } = await createOffline({
		enqueueEventType: "enqueue",
		postMessage: postMessageSpy,
	});
	const request = new Request(`${domain}/503`, {
		method: "POST",
		headers: new Headers({
			"Content-Type": "application/json",
			Authorization: "Bearer secret-token",
		}),
		body: JSON.stringify({ data: "test" }),
	});
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };

	await afterNetwork(request, response, event, {});
	await Promise.all(waitUntils);

	const enqueued = postMessageSpy.mock.calls[0].arguments[0];
	strictEqual(enqueued.headers.authorization, undefined);
	strictEqual(enqueued.headers["content-type"], "application/json");
	destroy();
});

test("afterNetwork: strips custom redactHeaders when enqueuing", async () => {
	const postMessageSpy = mock.fn();
	const { afterNetwork, destroy } = await createOffline({
		enqueueEventType: "enqueue",
		postMessage: postMessageSpy,
		redactHeaders: ["authorization", "x-api-key"],
	});
	const request = new Request(`${domain}/503`, {
		method: "POST",
		headers: new Headers({
			"Content-Type": "application/json",
			Authorization: "Bearer secret-token",
			"X-Api-Key": "my-api-key",
		}),
		body: JSON.stringify({ data: "test" }),
	});
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };

	await afterNetwork(request, response, event, {});
	await Promise.all(waitUntils);

	const enqueued = postMessageSpy.mock.calls[0].arguments[0];
	strictEqual(enqueued.headers.authorization, undefined);
	strictEqual(enqueued.headers["x-api-key"], undefined);
	strictEqual(enqueued.headers["content-type"], "application/json");
	destroy();
});

// *** timeout / pollDelay > 0 (lines 51-55) *** //

test("afterNetwork: enqueues with pollDelay > 0", async () => {
	const { afterNetwork, destroy } = await createOffline({
		pollDelay: 60000,
	});
	const request = new Request(`${domain}/503`, {
		method: "POST",
		body: "data",
	});
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };

	const result = await afterNetwork(request, response, event, {});
	strictEqual(result.status, 202);

	await Promise.all(waitUntils);
	destroy();
});

// *** postMessageEvent when navigator offline (lines 116-118) *** //

test("postMessageEvent: returns early and calls timeout when navigator is offline", async () => {
	const { postMessageEvent, destroy } = await createOffline({ pollDelay: 0 });

	const originalOnLine = navigator.onLine;
	Object.defineProperty(navigator, "onLine", {
		value: false,
		writable: true,
		configurable: true,
	});

	try {
		// Should return early without error when offline
		await postMessageEvent();
	} finally {
		Object.defineProperty(navigator, "onLine", {
			value: originalOnLine,
			writable: true,
			configurable: true,
		});
		destroy();
	}
});

// *** postMessageEvent when online with empty queue (lines 116, 120) *** //

test("postMessageEvent: does nothing when online and queue is empty", async () => {
	const { postMessageEvent, destroy } = await createOffline({ pollDelay: 0 });

	Object.defineProperty(navigator, "onLine", {
		value: true,
		writable: true,
		configurable: true,
	});

	// No items queued, cursor will be null/undefined, so it just returns
	await postMessageEvent();
	destroy();
});

// *** postMessageEvent dequeue path (lines 121-134) *** //

test("postMessageEvent: retries queued request and calls timeout when fetch returns offline status", async () => {
	const postMessageSpy = mock.fn();
	const { afterNetwork, postMessageEvent, destroy } = await createOffline({
		pollDelay: 0,
		postMessage: postMessageSpy,
		statusCodes: [503],
	});

	// Enqueue a request (URL /503 returns 503 on retry too)
	const request = new Request(`${domain}/503`, {
		method: "POST",
		body: JSON.stringify({ retry: true }),
		headers: { "Content-Type": "application/json" },
	});
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };

	await afterNetwork(request, response, event, {});
	await Promise.all(waitUntils);

	Object.defineProperty(navigator, "onLine", {
		value: true,
		writable: true,
		configurable: true,
	});

	// postMessageEvent fetches the queued /503 URL, gets 503 back,
	// so it hits the else branch (line 131-133) and calls timeout()
	await postMessageEvent();
	destroy();
});

test("postMessageEvent: dequeues request and calls postMessage with dequeueEventType on success", async () => {
	const postMessageSpy = mock.fn();
	const { afterNetwork, postMessageEvent, destroy } = await createOffline({
		pollDelay: 0,
		dequeueEventType: "dequeue",
		postMessage: postMessageSpy,
		statusCodes: [503],
	});

	// Enqueue: POST to /200 with a non-Response (error triggers enqueue)
	const request = new Request(`${domain}/200`, {
		method: "POST",
		body: JSON.stringify({ data: "retry-success" }),
		headers: { "Content-Type": "application/json" },
	});
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };

	await afterNetwork(request, undefined, event, {});
	await Promise.all(waitUntils);

	Object.defineProperty(navigator, "onLine", {
		value: true,
		writable: true,
		configurable: true,
	});

	// postMessageEvent fetches the queued /200 URL (returns 200, not in statusCodes)
	// so it enters the dequeue branch and calls postMessage with dequeueEventType
	await postMessageEvent();

	// Verify dequeue postMessage was called with the correct event type
	const dequeueCalls = postMessageSpy.mock.calls.filter(
		(call) => call.arguments[0].type === "dequeue",
	);
	strictEqual(dequeueCalls.length, 1);
	strictEqual(dequeueCalls[0].arguments[0].url, `${domain}/200`);
	destroy();
});

// *** idbOpenRequest.onerror (line 60) *** //
test("offlineMiddleware: idbOpenRequest.onerror should call consoleError", async (t) => {
	t.mock.method(console, "error", () => {});
	// Create a broken IndexedDB that triggers onerror
	const originalIndexedDB = globalThis.indexedDB;
	const errorEvent = new Event("error");
	const fakeOpenRequest = {
		onerror: null,
		onupgradeneeded: null,
		onsuccess: null,
		result: null,
	};
	globalThis.indexedDB = {
		open: () => {
			// Trigger onerror after the middleware sets up handlers
			setTimeout(() => {
				if (fakeOpenRequest.onerror) {
					fakeOpenRequest.onerror(errorEvent);
				}
			}, 10);
			return fakeOpenRequest;
		},
	};

	const { afterNetwork, destroy } = offlineMiddleware({ pollDelay: 0 });
	// Wait for the onerror to fire
	await new Promise((resolve) => setTimeout(resolve, 50));

	// Verify that enqueue rejects with the DB error
	const request = new Request(`${domain}/503`, {
		method: "POST",
		body: "data",
	});
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };
	await afterNetwork(request, response, event, {});
	let caught = false;
	try {
		await Promise.all(waitUntils);
	} catch {
		caught = true;
	}
	strictEqual(caught, true);

	destroy();
	globalThis.indexedDB = originalIndexedDB;
});

// *** idbStartTransaction waits for DB to initialize *** //
test("offlineMiddleware: enqueue waits for DB initialization and succeeds", async (t) => {
	t.mock.method(console, "error", () => {});
	const originalIndexedDB = globalThis.indexedDB;
	const realFactory = new IDBFactory();
	const origOpen = realFactory.open.bind(realFactory);

	// Delay onsuccess by 100ms to simulate slow DB initialization
	globalThis.indexedDB = {
		open: (...args) => {
			const req = origOpen(...args);
			let realOnSuccess;
			Object.defineProperty(req, "onsuccess", {
				get: () => realOnSuccess,
				set: (fn) => {
					realOnSuccess = () => {
						setTimeout(fn, 100);
					};
				},
				configurable: true,
			});
			return req;
		},
	};

	const postMessageSpy = mock.fn();
	const { afterNetwork, destroy } = offlineMiddleware({
		pollDelay: 0,
		enqueueEventType: "enqueue",
		postMessage: postMessageSpy,
	});

	// Call afterNetwork immediately — before DB is ready
	const request = new Request(`${domain}/503`, {
		method: "POST",
		body: "data",
	});
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };

	const result = await afterNetwork(request, response, event, {});
	strictEqual(result.status, 202);

	// The enqueue should succeed after DB initializes (wait for it)
	await Promise.all(waitUntils);
	strictEqual(postMessageSpy.mock.callCount(), 1);

	destroy();
	globalThis.indexedDB = originalIndexedDB;
});

// *** idbCursor onerror (line 75) *** //
test("offlineMiddleware: idbCursor onerror should reject enqueue", async (t) => {
	t.mock.method(console, "error", () => {});
	const originalIndexedDB = globalThis.indexedDB;
	const realFactory = new IDBFactory();
	const origOpen = realFactory.open.bind(realFactory);

	globalThis.indexedDB = {
		open: (...args) => {
			const req = origOpen(...args);
			let realOnSuccess;
			Object.defineProperty(req, "onsuccess", {
				get: () => realOnSuccess,
				set: (fn) => {
					realOnSuccess = () => {
						const db = req.result;
						const origTx = db.transaction.bind(db);
						db.transaction = (...txArgs) => {
							const tx = origTx(...txArgs);
							const origOs = tx.objectStore.bind(tx);
							tx.objectStore = (...osArgs) => {
								const os = origOs(...osArgs);
								const origOpenCursor = os.openCursor.bind(os);
								os.openCursor = (...cursorArgs) => {
									const cursorReq = origOpenCursor(...cursorArgs);
									// Override onsuccess to fire onerror instead
									const _origSet = Object.getOwnPropertyDescriptor(
										Object.getPrototypeOf(cursorReq),
										"onsuccess",
									);
									let storedOnError;
									Object.defineProperty(cursorReq, "onerror", {
										get: () => storedOnError,
										set: (fn) => {
											storedOnError = fn;
											// Fire onerror on next tick
											setTimeout(() => {
												fn({ target: { error: new Error("cursor error") } });
											}, 0);
										},
										configurable: true,
									});
									// Suppress onsuccess
									Object.defineProperty(cursorReq, "onsuccess", {
										get: () => null,
										set: () => {},
										configurable: true,
									});
									return cursorReq;
								};
								return os;
							};
							return tx;
						};
						fn();
					};
				},
				configurable: true,
			});
			return req;
		},
	};

	const { afterNetwork, destroy } = offlineMiddleware({ pollDelay: 0 });
	await new Promise((resolve) => setTimeout(resolve, 50));

	const request = new Request(`${domain}/503`, {
		method: "POST",
		body: "data",
	});
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };

	await afterNetwork(request, response, event, {});

	let caught = false;
	try {
		await Promise.all(waitUntils);
	} catch (e) {
		caught = true;
		strictEqual(e.message, "cursor error");
	}
	strictEqual(caught, true);

	destroy();
	globalThis.indexedDB = originalIndexedDB;
});

// *** postMessageEvent error handling *** //
test("postMessageEvent: does not crash when fetch throws", async (t) => {
	t.mock.method(console, "error", () => {});
	const { afterNetwork, postMessageEvent, destroy } = await createOffline({
		pollDelay: 0,
		statusCodes: [503],
	});

	// Enqueue a request
	const request = new Request(`${domain}/503`, {
		method: "POST",
		body: JSON.stringify({ data: "test" }),
		headers: { "Content-Type": "application/json" },
	});
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };
	await afterNetwork(request, response, event, {});
	await Promise.all(waitUntils);

	// Override fetch to throw
	const origFetch = globalThis.fetch;
	globalThis.fetch = () => {
		throw new Error("network failure");
	};

	Object.defineProperty(navigator, "onLine", {
		value: true,
		writable: true,
		configurable: true,
	});

	// postMessageEvent should not throw — it catches the error
	await postMessageEvent();

	globalThis.fetch = origFetch;
	destroy();
});

// *** enqueue duplicate detection (line 92 - cursor?.value matches serialized) *** //
test("afterNetwork: skips duplicate enqueue when cursor value matches", async () => {
	const postMessageSpy = mock.fn();
	const { afterNetwork, destroy } = await createOffline({
		enqueueEventType: "enqueue",
		postMessage: postMessageSpy,
	});
	const request = new Request(`${domain}/503`, {
		method: "POST",
		body: JSON.stringify({ data: "duplicate" }),
		headers: { "Content-Type": "application/json" },
	});
	const response = new Response("", { status: 503 });

	// Enqueue the first time
	const waitUntils1 = [];
	const event1 = { waitUntil: (p) => waitUntils1.push(p) };
	await afterNetwork(request, response, event1, {});
	await Promise.all(waitUntils1);

	strictEqual(postMessageSpy.mock.callCount(), 1);

	// Enqueue the exact same request again — should be detected as duplicate
	const request2 = new Request(`${domain}/503`, {
		method: "POST",
		body: JSON.stringify({ data: "duplicate" }),
		headers: { "Content-Type": "application/json" },
	});
	const response2 = new Response("", { status: 503 });
	const waitUntils2 = [];
	const event2 = { waitUntil: (p) => waitUntils2.push(p) };
	await afterNetwork(request2, response2, event2, {});
	await Promise.all(waitUntils2);

	// Should not enqueue again (duplicate detected)
	strictEqual(postMessageSpy.mock.callCount(), 1);
	destroy();
});

// *** enqueue idbObjectStore.add throws (lines 101-110) *** //
test("afterNetwork: handles idbObjectStore.add error including QuotaExceededError", async (t) => {
	t.mock.method(console, "error", () => {});
	const postMessageSpy = mock.fn();
	const originalIndexedDB = globalThis.indexedDB;

	// Create a custom IDB factory that wraps the real one but makes add() throw
	const realFactory = new IDBFactory();
	let addShouldThrow = false;
	const origOpen = realFactory.open.bind(realFactory);

	globalThis.indexedDB = {
		open: (...args) => {
			const req = origOpen(...args);
			const _origOnSuccess = Object.getOwnPropertyDescriptor(
				Object.getPrototypeOf(req),
				"onsuccess",
			);

			// Wrap onsuccess to proxy the database object
			let realOnSuccess;
			Object.defineProperty(req, "onsuccess", {
				get: () => realOnSuccess,
				set: (fn) => {
					realOnSuccess = () => {
						const db = req.result;
						const origTx = db.transaction.bind(db);
						db.transaction = (...txArgs) => {
							const tx = origTx(...txArgs);
							const origOs = tx.objectStore.bind(tx);
							tx.objectStore = (...osArgs) => {
								const os = origOs(...osArgs);
								const origAdd = os.add.bind(os);
								os.add = (...addArgs) => {
									if (addShouldThrow) {
										throw new DOMException(
											"quota exceeded",
											"QuotaExceededError",
										);
									}
									return origAdd(...addArgs);
								};
								return os;
							};
							return tx;
						};
						fn();
					};
				},
				configurable: true,
			});

			return req;
		},
	};

	const { afterNetwork, destroy } = offlineMiddleware({
		pollDelay: 0,
		quotaExceededEventType: "quota-exceeded",
		postMessage: postMessageSpy,
	});

	// Wait for IDB to initialize
	await new Promise((resolve) => setTimeout(resolve, 50));

	// Enqueue normally first
	const request1 = new Request(`${domain}/503`, {
		method: "POST",
		body: JSON.stringify({ data: "first" }),
		headers: { "Content-Type": "application/json" },
	});
	const response1 = new Response("", { status: 503 });
	const waitUntils1 = [];
	const event1 = { waitUntil: (p) => waitUntils1.push(p) };
	await afterNetwork(request1, response1, event1, {});
	await Promise.all(waitUntils1);

	// Now enable the throw
	addShouldThrow = true;

	const request2 = new Request(`${domain}/503`, {
		method: "POST",
		body: JSON.stringify({ data: "trigger-quota" }),
		headers: { "Content-Type": "application/json" },
	});
	const response2 = new Response("", { status: 503 });
	const waitUntils2 = [];
	const event2 = { waitUntil: (p) => waitUntils2.push(p) };
	await afterNetwork(request2, response2, event2, {});
	await Promise.all(waitUntils2);

	// Should have posted quota-exceeded message
	const quotaCalls = postMessageSpy.mock.calls.filter(
		(c) => c.arguments[0]?.type === "quota-exceeded",
	);
	strictEqual(quotaCalls.length, 1);

	destroy();
	globalThis.indexedDB = originalIndexedDB;
});
