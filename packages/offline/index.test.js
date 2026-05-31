/* global Request Response Headers */

import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";

import { notStrictEqual, ok, strictEqual } from "node:assert";
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
	strictEqual(serialized.body.encoding, "text");
	strictEqual(serialized.body.data, '{"key":"value"}');
	strictEqual(serialized.headers["content-type"], "application/json");
});

test("idbSerializeRequest: roundtrips a binary (ArrayBuffer) body", async () => {
	const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0, 1, 2, 3]);
	const request = new Request(`${domain}/200`, {
		method: "POST",
		headers: new Headers({ "Content-Type": "application/octet-stream" }),
		body: bytes,
	});

	const serialized = await idbSerializeRequest(request);
	const restored = idbDeserializeRequest(serialized);
	const restoredBytes = new Uint8Array(await restored.arrayBuffer());

	strictEqual(restoredBytes.length, bytes.length);
	for (let i = 0; i < bytes.length; i++) {
		strictEqual(restoredBytes[i], bytes[i]);
	}
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

test("postMessageEvent: does nothing (and logs nothing) when online and queue is empty", async (t) => {
	const errorSpy = t.mock.method(console, "error", () => {});
	const { postMessageEvent, destroy } = await createOffline({ pollDelay: 0 });

	Object.defineProperty(navigator, "onLine", {
		value: true,
		writable: true,
		configurable: true,
	});

	// Empty queue: peekHead resolves null, so `if (!head) break` exits the drain
	// loop cleanly with no fetch and no error. The `if (false) break` mutant skips
	// the break and dereferences `head.value` (null) -> throws -> caught -> logged.
	await postMessageEvent();
	strictEqual(errorSpy.mock.callCount(), 0);
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

// *** multi-item queue drains in order *** //
test("postMessageEvent: drains multiple queued requests one at a time", async () => {
	const { afterNetwork, postMessageEvent, destroy } = await createOffline({
		pollDelay: 0,
		statusCodes: [503],
	});

	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };
	for (const path of ["/200", "/en/200"]) {
		const request = new Request(`${domain}${path}`, {
			method: "POST",
			body: JSON.stringify({ p: path }),
			headers: { "Content-Type": "application/json" },
		});
		await afterNetwork(request, undefined, event, {});
	}
	await Promise.all(waitUntils);

	Object.defineProperty(navigator, "onLine", {
		value: true,
		writable: true,
		configurable: true,
	});

	const fetchCalls = [];
	const origFetch = globalThis.fetch;
	globalThis.fetch = (req) => {
		fetchCalls.push(req.url);
		return origFetch(req);
	};

	// Each postMessageEvent drains at most one; call until quiescent.
	await postMessageEvent();
	await postMessageEvent();
	await postMessageEvent();

	strictEqual(fetchCalls.length, 2);
	globalThis.fetch = origFetch;
	destroy();
});

// *** queue empties after successful dequeue *** //
test("postMessageEvent: queue is empty after successful dequeue", async () => {
	const postMessageSpy = mock.fn();
	const { afterNetwork, postMessageEvent, destroy } = await createOffline({
		pollDelay: 0,
		dequeueEventType: "dequeue",
		postMessage: postMessageSpy,
		statusCodes: [503],
	});

	const request = new Request(`${domain}/200`, {
		method: "POST",
		body: JSON.stringify({ data: "once" }),
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

	const fetchCalls = [];
	const origFetch = globalThis.fetch;
	globalThis.fetch = (req) => {
		fetchCalls.push(req.url);
		return origFetch(req);
	};

	await postMessageEvent();
	// Second call should find the queue empty → no more fetches
	await postMessageEvent();

	strictEqual(fetchCalls.length, 1);
	globalThis.fetch = origFetch;
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

// *** databaseName option *** //
test("offlineMiddleware: honors custom databaseName and objectStoreName", async () => {
	const postMessageSpy = mock.fn();
	const { afterNetwork, destroy } = await createOffline({
		databaseName: "custom-db",
		objectStoreName: "queue",
		enqueueEventType: "enqueue",
		postMessage: postMessageSpy,
	});

	const request = new Request(`${domain}/503`, {
		method: "POST",
		body: JSON.stringify({ data: "custom" }),
		headers: { "Content-Type": "application/json" },
	});
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };

	const result = await afterNetwork(request, response, event, {});
	await Promise.all(waitUntils);

	strictEqual(result.status, 202);
	strictEqual(postMessageSpy.mock.callCount(), 1);

	// The queue must live in the custom database, never the default "sw".
	// This fails if the middleware reverts to a hardcoded database name.
	const dbNames = (await globalThis.indexedDB.databases()).map((d) => d.name);
	strictEqual(dbNames.includes("custom-db"), true);
	strictEqual(dbNames.includes("sw"), false);
	destroy();
});

// Count entries currently in the offline queue object store.
const countStore = (databaseName = "sw", objectStoreName = "offline") =>
	new Promise((resolve, reject) => {
		const open = globalThis.indexedDB.open(databaseName, 1);
		open.onerror = (e) => reject(e?.target?.error);
		open.onsuccess = () => {
			const db = open.result;
			const tx = db.transaction([objectStoreName], "readonly");
			const req = tx.objectStore(objectStoreName).count();
			req.onsuccess = () => {
				db.close();
				resolve(req.result);
			};
			req.onerror = (e) => reject(e?.target?.error);
		};
	});

// Patches indexedDB.open so the next transaction fires the named lifecycle
// handler (`onabort` or `onerror`) right after `work(store)` runs, exercising
// the rejection paths in withStore's `done` promise.
const installTransactionFailure = (handlerName) => {
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
							Object.defineProperty(tx, "error", {
								get: () => new Error(`tx ${handlerName}`),
								configurable: true,
							});
							let stored;
							Object.defineProperty(tx, handlerName, {
								get: () => stored,
								set: (fn2) => {
									stored = fn2;
									setTimeout(() => fn2(new Event(handlerName)), 0);
								},
								configurable: true,
							});
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
};

// *** withStore: transaction onabort rejects (line 101) *** //
test("offlineMiddleware: transaction onabort rejects the operation", async (t) => {
	t.mock.method(console, "error", () => {});
	const originalIndexedDB = globalThis.indexedDB;
	installTransactionFailure("onabort");

	const { afterNetwork, destroy } = offlineMiddleware({ pollDelay: 0 });
	await new Promise((resolve) => setTimeout(resolve, 50));

	const request = new Request(`${domain}/503`, { method: "POST", body: "x" });
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };
	await afterNetwork(request, response, event, {});

	let caught = false;
	try {
		await Promise.all(waitUntils);
	} catch (e) {
		caught = true;
		strictEqual(e.message, "tx onabort");
	}
	strictEqual(caught, true);

	destroy();
	globalThis.indexedDB = originalIndexedDB;
});

// *** withStore: transaction onerror rejects (line 102) *** //
test("offlineMiddleware: transaction onerror rejects the operation", async (t) => {
	t.mock.method(console, "error", () => {});
	const originalIndexedDB = globalThis.indexedDB;
	installTransactionFailure("onerror");

	const { afterNetwork, destroy } = offlineMiddleware({ pollDelay: 0 });
	await new Promise((resolve) => setTimeout(resolve, 50));

	const request = new Request(`${domain}/503`, { method: "POST", body: "x" });
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };
	await afterNetwork(request, response, event, {});

	let caught = false;
	try {
		await Promise.all(waitUntils);
	} catch (e) {
		caught = true;
		strictEqual(e.message, "tx onerror");
	}
	strictEqual(caught, true);

	destroy();
	globalThis.indexedDB = originalIndexedDB;
});

// *** M6/#2c: a permanent 4xx replay is evicted (not dequeued) and surfaced *** //
test("postMessageEvent: evicts queued request when replay returns 4xx and fires failedEventType", async () => {
	const postMessageSpy = mock.fn();
	const { afterNetwork, postMessageEvent, destroy } = await createOffline({
		pollDelay: 0,
		dequeueEventType: "dequeue",
		failedEventType: "failed",
		postMessage: postMessageSpy,
		statusCodes: [503],
	});

	// Enqueue a request whose URL replays to 403 (a non-retryable client error).
	const request = new Request(`${domain}/403`, {
		method: "POST",
		body: JSON.stringify({ data: "permanent-failure" }),
		headers: { "Content-Type": "application/json" },
	});
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };
	await afterNetwork(request, undefined, event, {});
	await Promise.all(waitUntils);

	strictEqual(await countStore(), 1);

	Object.defineProperty(navigator, "onLine", {
		value: true,
		writable: true,
		configurable: true,
	});

	// Replay gets a 403 (not ok, not retryable). The entry must be EVICTED so it
	// cannot wedge the queue, surfaced via failedEventType (body stripped), and
	// it must NOT fire a dequeue event (it did not succeed).
	await postMessageEvent();

	strictEqual(await countStore(), 0);
	const dequeueCalls = postMessageSpy.mock.calls.filter(
		(c) => c.arguments[0].type === "dequeue",
	);
	strictEqual(dequeueCalls.length, 0);
	const failedCalls = postMessageSpy.mock.calls.filter(
		(c) => c.arguments[0].type === "failed",
	);
	strictEqual(failedCalls.length, 1);
	strictEqual(failedCalls[0].arguments[0].url, `${domain}/403`);
	strictEqual(failedCalls[0].arguments[0].method, "POST");
	strictEqual(failedCalls[0].arguments[0].body, undefined);
	destroy();
});

// *** #2c: an evicted permanent failure does NOT block the next queued item *** //
test("postMessageEvent: permanent 4xx is evicted and the next queued item still drains", async () => {
	const postMessageSpy = mock.fn();
	const { afterNetwork, postMessageEvent, destroy } = await createOffline({
		pollDelay: 0,
		dequeueEventType: "dequeue",
		failedEventType: "failed",
		postMessage: postMessageSpy,
		statusCodes: [503],
	});

	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };
	// HEAD replays to 403 (permanent), the next item replays to 200 (success).
	for (const path of ["/403", "/200"]) {
		const request = new Request(`${domain}${path}`, {
			method: "POST",
			body: JSON.stringify({ p: path }),
			headers: { "Content-Type": "application/json" },
		});
		await afterNetwork(request, undefined, event, {});
	}
	await Promise.all(waitUntils);
	strictEqual(await countStore(), 2);

	Object.defineProperty(navigator, "onLine", {
		value: true,
		writable: true,
		configurable: true,
	});

	const fetchCalls = [];
	const origFetch = globalThis.fetch;
	globalThis.fetch = (req) => {
		fetchCalls.push(req.url);
		return origFetch(req);
	};

	// A single drain must evict the 403 AND continue to replay the 200 in the
	// same pass (head-of-line blocking fix), so both URLs are fetched.
	await postMessageEvent();

	globalThis.fetch = origFetch;

	strictEqual(fetchCalls.includes(`${domain}/403`), true);
	strictEqual(fetchCalls.includes(`${domain}/200`), true);
	strictEqual(await countStore(), 0);
	const failedCalls = postMessageSpy.mock.calls.filter(
		(c) => c.arguments[0].type === "failed",
	);
	strictEqual(failedCalls.length, 1);
	strictEqual(failedCalls[0].arguments[0].url, `${domain}/403`);
	const dequeueCalls = postMessageSpy.mock.calls.filter(
		(c) => c.arguments[0].type === "dequeue",
	);
	strictEqual(dequeueCalls.length, 1);
	strictEqual(dequeueCalls[0].arguments[0].url, `${domain}/200`);
	destroy();
});

// *** #2c: permanent failure is evicted even without a failedEventType option *** //
test("postMessageEvent: permanent 4xx is evicted even when failedEventType is unset", async () => {
	const { afterNetwork, postMessageEvent, destroy } = await createOffline({
		pollDelay: 0,
		statusCodes: [503],
	});

	const request = new Request(`${domain}/403`, {
		method: "POST",
		body: JSON.stringify({ data: "no-event" }),
		headers: { "Content-Type": "application/json" },
	});
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };
	await afterNetwork(request, undefined, event, {});
	await Promise.all(waitUntils);
	strictEqual(await countStore(), 1);

	Object.defineProperty(navigator, "onLine", {
		value: true,
		writable: true,
		configurable: true,
	});

	await postMessageEvent();

	strictEqual(await countStore(), 0);
	destroy();
});

// *** #1: a concurrent trigger DURING an in-flight drain must NOT double-replay *** //
test("postMessageEvent: concurrent trigger mid-drain does not replay any item twice", async () => {
	const { afterNetwork, postMessageEvent, destroy } = await createOffline({
		pollDelay: 0,
		statusCodes: [503],
	});

	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };
	for (const path of ["/200", "/en/200"]) {
		const request = new Request(`${domain}${path}`, {
			method: "POST",
			body: JSON.stringify({ p: path }),
			headers: { "Content-Type": "application/json" },
		});
		await afterNetwork(request, undefined, event, {});
	}
	await Promise.all(waitUntils);

	Object.defineProperty(navigator, "onLine", {
		value: true,
		writable: true,
		configurable: true,
	});

	// Controllable fetch: the fetch of the SECOND queued item (/en/200) is held
	// open via a deferred gate so the drain is provably mid-flight on item #2.
	// The first item (/200) replays normally. The previous recursion+finally bug
	// flips `draining` back to false the instant the recursive call awaits item
	// #2's fetch — reopening the guard. While that fetch is held we fire a second
	// concurrent postMessageEvent (simulating online event + poll timer racing);
	// if the guard is open it starts a parallel drain and replays /en/200 twice.
	const fetchCalls = [];
	const origFetch = globalThis.fetch;
	const gatedUrl = `${domain}/en/200`;
	let releaseGate;
	const fetchGate = new Promise((resolve) => {
		releaseGate = resolve;
	});
	let gatedFetchStarted;
	const gatedFetchInFlight = new Promise((resolve) => {
		gatedFetchStarted = resolve;
	});
	globalThis.fetch = async (req) => {
		fetchCalls.push(req.url);
		if (req.url === gatedUrl) {
			gatedFetchStarted();
			await fetchGate;
		}
		return origFetch(req);
	};

	// Start the first drain; it replays /200, then pauses inside /en/200's fetch.
	const firstDrain = postMessageEvent();
	// Wait until the loop is genuinely inside the /en/200 fetch await.
	await gatedFetchInFlight;
	// Fire the second, concurrent trigger while the first drain is mid-flight.
	const secondDrain = postMessageEvent();
	// Release the held fetch so both drains can run to completion.
	releaseGate();
	await Promise.all([firstDrain, secondDrain]);
	// Drain any residue (there should be none if the guard held).
	await postMessageEvent();

	globalThis.fetch = origFetch;

	const counts = {};
	for (const url of fetchCalls) counts[url] = (counts[url] ?? 0) + 1;
	strictEqual(counts[`${domain}/200`], 1);
	strictEqual(counts[`${domain}/en/200`], 1);
	destroy();
});

// *** M6: replay to a retryable status leaves the request queued *** //
test("postMessageEvent: keeps queued request when replay returns retryable status", async () => {
	const { afterNetwork, postMessageEvent, destroy } = await createOffline({
		pollDelay: 0,
		statusCodes: [503],
	});

	const request = new Request(`${domain}/503`, {
		method: "POST",
		body: JSON.stringify({ data: "retry-me" }),
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

	await postMessageEvent();

	strictEqual(await countStore(), 1);
	destroy();
});

// *** M12: overlapping postMessageEvent calls drain each item at most once *** //
test("postMessageEvent: overlapping calls drain each item at most once", async () => {
	const { afterNetwork, postMessageEvent, destroy } = await createOffline({
		pollDelay: 0,
		statusCodes: [503],
	});

	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };
	for (const path of ["/200", "/en/200"]) {
		const request = new Request(`${domain}${path}`, {
			method: "POST",
			body: JSON.stringify({ p: path }),
			headers: { "Content-Type": "application/json" },
		});
		await afterNetwork(request, undefined, event, {});
	}
	await Promise.all(waitUntils);

	Object.defineProperty(navigator, "onLine", {
		value: true,
		writable: true,
		configurable: true,
	});

	const fetchCalls = [];
	const origFetch = globalThis.fetch;
	globalThis.fetch = (req) => {
		fetchCalls.push(req.url);
		return origFetch(req);
	};

	// Two overlapping triggers (e.g. online event + timer). With a draining
	// guard, the second call must be a no-op while the first is in flight, so
	// each queued item is fetched at most once.
	await Promise.all([postMessageEvent(), postMessageEvent()]);
	// Drain anything still queued.
	await postMessageEvent();
	await postMessageEvent();

	const counts = {};
	for (const url of fetchCalls) counts[url] = (counts[url] ?? 0) + 1;
	strictEqual(counts[`${domain}/200`], 1);
	strictEqual(counts[`${domain}/en/200`], 1);

	globalThis.fetch = origFetch;
	destroy();
});

// *** L7: enqueue event fires only AFTER the IDB write succeeds *** //
test("afterNetwork: does not post enqueue event when IDB add fails (quota)", async (t) => {
	t.mock.method(console, "error", () => {});
	const postMessageSpy = mock.fn();
	const originalIndexedDB = globalThis.indexedDB;

	const realFactory = new IDBFactory();
	let addShouldThrow = false;
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
		enqueueEventType: "enqueue",
		quotaExceededEventType: "quota-exceeded",
		postMessage: postMessageSpy,
	});
	await new Promise((resolve) => setTimeout(resolve, 50));

	addShouldThrow = true;
	const request = new Request(`${domain}/503`, {
		method: "POST",
		body: JSON.stringify({ data: "trigger-quota" }),
		headers: { "Content-Type": "application/json" },
	});
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };
	await afterNetwork(request, response, event, {});
	await Promise.all(waitUntils);

	// The write failed, so NO enqueue event must have been posted — only the
	// quota-exceeded notification.
	const enqueueCalls = postMessageSpy.mock.calls.filter(
		(c) => c.arguments[0]?.type === "enqueue",
	);
	const quotaCalls = postMessageSpy.mock.calls.filter(
		(c) => c.arguments[0]?.type === "quota-exceeded",
	);
	strictEqual(enqueueCalls.length, 0);
	strictEqual(quotaCalls.length, 1);

	destroy();
	globalThis.indexedDB = originalIndexedDB;
});

// *** L10: enqueue/dequeue payloads must NOT include the request body (PII) *** //
test("enqueue/dequeue postMessage payloads omit the request body", async () => {
	const postMessageSpy = mock.fn();
	const { afterNetwork, postMessageEvent, destroy } = await createOffline({
		pollDelay: 0,
		enqueueEventType: "enqueue",
		dequeueEventType: "dequeue",
		postMessage: postMessageSpy,
		statusCodes: [503],
	});

	const request = new Request(`${domain}/200`, {
		method: "POST",
		body: JSON.stringify({ secret: "pii-data" }),
		headers: { "Content-Type": "application/json" },
	});
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };
	await afterNetwork(request, undefined, event, {});
	await Promise.all(waitUntils);

	const enqueued = postMessageSpy.mock.calls.find(
		(c) => c.arguments[0].type === "enqueue",
	).arguments[0];
	strictEqual(enqueued.body, undefined);
	strictEqual(enqueued.method, "POST");
	strictEqual(enqueued.url, `${domain}/200`);

	Object.defineProperty(navigator, "onLine", {
		value: true,
		writable: true,
		configurable: true,
	});

	await postMessageEvent();

	const dequeued = postMessageSpy.mock.calls.find(
		(c) => c.arguments[0].type === "dequeue",
	).arguments[0];
	strictEqual(dequeued.body, undefined);
	strictEqual(dequeued.method, "POST");
	strictEqual(dequeued.url, `${domain}/200`);
	destroy();
});

// *** redactHeaders defaults: cookie / set-cookie / proxy-authorization (lines 41-43) ***
// The default redactHeaders array strips four credential headers. The
// authorization entry is covered above; this asserts the remaining three are
// also stripped, killing the StringLiteral mutants that blank each name.
test("afterNetwork: strips cookie, set-cookie and proxy-authorization by default", async () => {
	const postMessageSpy = mock.fn();
	const { afterNetwork, destroy } = await createOffline({
		enqueueEventType: "enqueue",
		postMessage: postMessageSpy,
	});
	const request = new Request(`${domain}/503`, {
		method: "POST",
		headers: new Headers({
			"Content-Type": "application/json",
			Cookie: "session=abc",
			"Set-Cookie": "session=abc; HttpOnly",
			"Proxy-Authorization": "Basic Zm9v",
		}),
		body: JSON.stringify({ data: "test" }),
	});
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };

	await afterNetwork(request, response, event, {});
	await Promise.all(waitUntils);

	const enqueued = postMessageSpy.mock.calls[0].arguments[0];
	// Each of these MUST be stripped. A blanked redact name ("" instead of the
	// real header) would leave the original header in the payload.
	strictEqual(enqueued.headers.cookie, undefined);
	strictEqual(enqueued.headers["set-cookie"], undefined);
	strictEqual(enqueued.headers["proxy-authorization"], undefined);
	// A non-redacted header survives, proving redaction is targeted.
	strictEqual(enqueued.headers["content-type"], "application/json");
	destroy();
});

// *** afterNetwork method guard returns the ORIGINAL response (line 48) ***
// A GET is not in `methods`, so afterNetwork must return the network response
// untouched WITHOUT enqueuing — even when that response carries a queue-worthy
// status (503). If the method guard is bypassed (`if (false)` / empty block),
// the 503 is not in the success path either, so the request would be enqueued
// and a 202 returned instead.
test("afterNetwork: non-queued method (GET) returns original 503 response and does not enqueue", async () => {
	const { afterNetwork, destroy } = await createOffline();
	const request = new Request(`${domain}/503`, { method: "GET" });
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };

	const result = await afterNetwork(request, response, event, {});

	// Real code short-circuits on the method check: same Response object, status
	// 503, and nothing handed to waitUntil. The mutant would enqueue and return
	// a freshly built 202.
	strictEqual(result, response);
	strictEqual(result.status, 503);
	strictEqual(waitUntils.length, 0);
	destroy();
});

// *** poll timer scheduling: default delay + head-gated timeout (lines 34, 61-62, 172) ***
// `timeout()` schedules `setTimeout(postMessageEvent, pollDelay)`. With the
// default pollDelay (option omitted) the delay must be exactly 60000ms, and the
// timer is armed ONLY when the first item is enqueued into an empty queue
// (`if (!head)`), not on subsequent enqueues. We wrap the real setTimeout so the
// timer still fires through to fake-indexeddb, and match on the middleware's own
// postMessageEvent reference to ignore unrelated internal timers.
test("enqueue: arms poll timer with default 60000ms delay only on the first (empty-queue) enqueue", async () => {
	globalThis.indexedDB = new IDBFactory();
	// pollDelay omitted entirely -> exercises the `??= 1 * 60 * 1000` default.
	const offline = offlineMiddleware({});
	const { afterNetwork, postMessageEvent, destroy } = offline;
	await new Promise((resolve) => setTimeout(resolve, 50));

	const origSetTimeout = globalThis.setTimeout;
	const timerCalls = [];
	const pollTimerIds = [];
	globalThis.setTimeout = (fn, delay, ...rest) => {
		const id = origSetTimeout(fn, delay, ...rest);
		timerCalls.push({ fn, delay });
		// Track the real poll timers so we can cancel them; a 60s timer would
		// otherwise keep the process alive and fire postMessageEvent after the DB
		// is closed.
		if (fn === postMessageEvent) pollTimerIds.push(id);
		return id;
	};
	const pollTimerCalls = () =>
		timerCalls.filter((c) => c.fn === postMessageEvent);

	try {
		// First enqueue into an EMPTY queue -> head is null -> timeout() runs.
		const req1 = new Request(`${domain}/503`, {
			method: "POST",
			body: JSON.stringify({ n: 1 }),
			headers: { "Content-Type": "application/json" },
		});
		const w1 = [];
		await afterNetwork(req1, new Response("", { status: 503 }), {
			waitUntil: (p) => w1.push(p),
		});
		await Promise.all(w1);

		const afterFirst = pollTimerCalls();
		// Exactly one poll timer, scheduled with the default 60000ms. Kills:
		//  - pollDelay arithmetic mutants (16.67 / 0.06 instead of 60000)
		//  - pollDelay `&&=` mutant (default never assigned -> undefined -> no timer)
		//  - `if (pollDelay > 0)` -> false and the timeout block removal (no timer)
		//  - `if (!head)` -> if(head)/false and its block removal (no timer)
		strictEqual(afterFirst.length, 1);
		strictEqual(afterFirst[0].delay, 60000);

		// Second enqueue of a DIFFERENT request -> head now exists -> NO new timer.
		const req2 = new Request(`${domain}/503`, {
			method: "POST",
			body: JSON.stringify({ n: 2 }),
			headers: { "Content-Type": "application/json" },
		});
		const w2 = [];
		await afterNetwork(req2, new Response("", { status: 503 }), {
			waitUntil: (p) => w2.push(p),
		});
		await Promise.all(w2);

		// Still exactly one. Kills `if (!head)` -> if(true), which would re-arm the
		// timer on every enqueue regardless of queue state.
		strictEqual(pollTimerCalls().length, 1);
	} finally {
		globalThis.setTimeout = origSetTimeout;
		destroy();
		for (const id of pollTimerIds) clearTimeout(id);
	}
});

// *** onsuccess (idbDatabase set) survives a DB reopen with no upgrade (line 86) ***
// A SECOND middleware instance opening the SAME (already-created) database does
// NOT receive `onupgradeneeded` — only `onsuccess` fires, so `idbDatabase` can
// only be assigned there. With `&&=` instead of `??=`, `idbDatabase` stays
// undefined and the next transaction throws. The instance must still enqueue.
test("offlineMiddleware: a second instance reopening an existing database can still enqueue", async () => {
	globalThis.indexedDB = new IDBFactory();

	// First instance creates database "shared" (fires onupgradeneeded + onsuccess).
	const first = offlineMiddleware({ pollDelay: 0, databaseName: "shared" });
	await new Promise((resolve) => setTimeout(resolve, 50));

	// Second instance reopens the existing v1 database: onupgradeneeded does NOT
	// fire, so onsuccess is the sole place idbDatabase is set.
	const postMessageSpy = mock.fn();
	const second = offlineMiddleware({
		pollDelay: 0,
		databaseName: "shared",
		enqueueEventType: "enqueue",
		postMessage: postMessageSpy,
	});
	await new Promise((resolve) => setTimeout(resolve, 50));

	const request = new Request(`${domain}/503`, {
		method: "POST",
		body: JSON.stringify({ data: "via-second-instance" }),
		headers: { "Content-Type": "application/json" },
	});
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };
	const result = await second.afterNetwork(
		request,
		new Response("", { status: 503 }),
		event,
		{},
	);
	// On real code the enqueue succeeds and notifies; with `&&=`, idbDatabase is
	// undefined and the transaction throws, so this rejects / never notifies.
	await Promise.all(waitUntils);
	strictEqual(result.status, 202);
	strictEqual(postMessageSpy.mock.callCount(), 1);

	first.destroy();
	second.destroy();
});

// Patches indexedDB.open so the next peekHead cursor fires `handlerName`
// (onsuccess|onerror) exactly once with `event`, suppressing the natural
// dispatch. Used to exercise the defensive optional chaining in peekHead with
// malformed events that real IndexedDB never produces.
const installCursorEvent = (handlerName, event) => {
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
									const other =
										handlerName === "onsuccess" ? "onerror" : "onsuccess";
									// Return null from the getter so fake-indexeddb skips the
									// natural dispatch; we fire our own malformed event instead.
									Object.defineProperty(cursorReq, handlerName, {
										get: () => null,
										set: (fn2) => {
											setTimeout(() => {
												// A real IDB event dispatch swallows a handler throw;
												// mirror that so the surrounding promise simply never
												// settles (the observable hang under the mutant).
												try {
													fn2(event);
												} catch {}
											}, 0);
										},
										configurable: true,
									});
									Object.defineProperty(cursorReq, other, {
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
};

// Drives one enqueue through a cursor whose handler fires `event`, and reports
// whether the operation completed, rejected, or hung (never settled).
const enqueueWithCursorEvent = async (handlerName, event) => {
	installCursorEvent(handlerName, event);
	const { afterNetwork, destroy } = offlineMiddleware({ pollDelay: 0 });
	await new Promise((resolve) => setTimeout(resolve, 50));
	const request = new Request(`${domain}/503`, { method: "POST", body: "x" });
	const response = new Response("", { status: 503 });
	const waitUntils = [];
	const event2 = { waitUntil: (p) => waitUntils.push(p) };
	await afterNetwork(request, response, event2, {});
	const outcome = await Promise.race([
		Promise.all(waitUntils).then(
			() => "done",
			() => "rejected",
		),
		new Promise((resolve) => setTimeout(() => resolve("hang"), 300)),
	]);
	destroy();
	return outcome;
};

// *** peekHead cursor onsuccess optional chaining (line 118) ***
// `const cursor = e?.target?.result;` must tolerate a missing `e` and a missing
// `e.target` (resolving to no head, so the enqueue proceeds). Dropping either
// `?.` makes the handler throw on the corresponding malformed event, hanging the
// operation instead of completing.
test("peekHead: cursor onsuccess tolerates an event with no target (kills e?.target.result)", async (t) => {
	const originalIndexedDB = globalThis.indexedDB;
	const outcome = await enqueueWithCursorEvent("onsuccess", {
		target: undefined,
	});
	// Real: resolves to null head -> enqueue completes. Mutant `e?.target.result`
	// throws on `undefined.result` -> hangs.
	strictEqual(outcome, "done");
	t.diagnostic(`onsuccess no-target outcome: ${outcome}`);
	globalThis.indexedDB = originalIndexedDB;
});

test("peekHead: cursor onsuccess tolerates a missing event (kills e.target?.result)", async () => {
	const originalIndexedDB = globalThis.indexedDB;
	const outcome = await enqueueWithCursorEvent("onsuccess", undefined);
	// Real: e?. short-circuits -> null head -> enqueue completes. Mutant
	// `e.target?.result` throws on `undefined.target` -> hangs.
	strictEqual(outcome, "done");
	globalThis.indexedDB = originalIndexedDB;
});

// *** peekHead cursor onerror optional chaining (line 121) ***
// `req.onerror = (e) => reject(e?.target?.error);` must reject (not throw)
// regardless of a missing `e` or a null `e.target`. Dropping either `?.` makes
// the handler throw, hanging the operation instead of rejecting it.
test("peekHead: cursor onerror tolerates a null target (kills e?.target.error)", async () => {
	const originalIndexedDB = globalThis.indexedDB;
	const outcome = await enqueueWithCursorEvent("onerror", { target: null });
	// Real: rejects with undefined -> enqueue rejects. Mutant `e?.target.error`
	// throws on `null.error` -> hangs.
	strictEqual(outcome, "rejected");
	notStrictEqual(outcome, "hang");
	globalThis.indexedDB = originalIndexedDB;
});

test("peekHead: cursor onerror tolerates a missing event (kills e.target?.error)", async () => {
	const originalIndexedDB = globalThis.indexedDB;
	const outcome = await enqueueWithCursorEvent("onerror", undefined);
	// Real: e?. short-circuits -> rejects with undefined. Mutant `e.target?.error`
	// throws on `undefined.target` -> hangs.
	strictEqual(outcome, "rejected");
	notStrictEqual(outcome, "hang");
	globalThis.indexedDB = originalIndexedDB;
});

// *** enqueue add-error: quota notification is gated on BOTH name and option (line 161) ***
// `if (e.name === "QuotaExceededError" && quotaExceededEventType)` must NOT fire
// the quota message for a non-quota add error, even when quotaExceededEventType
// is configured. This kills the `if (true)`, name-drop, and `&&`->`||` mutants,
// all of which would post for a generic error.
test("afterNetwork: a non-quota IDB add error does not post the quota-exceeded message", async (t) => {
	t.mock.method(console, "error", () => {});
	const postMessageSpy = mock.fn();
	const realFactory = new IDBFactory();
	let addShouldThrow = false;
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
								const origAdd = os.add.bind(os);
								os.add = (...addArgs) => {
									if (addShouldThrow) {
										// A generic error whose name is NOT "QuotaExceededError".
										const err = new Error("disk on fire");
										throw err;
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
	await new Promise((resolve) => setTimeout(resolve, 50));

	addShouldThrow = true;
	const request = new Request(`${domain}/503`, {
		method: "POST",
		body: JSON.stringify({ data: "generic-error" }),
		headers: { "Content-Type": "application/json" },
	});
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };
	await afterNetwork(request, new Response("", { status: 503 }), event, {});
	await Promise.all(waitUntils);

	// Real code: name !== "QuotaExceededError" -> no quota message at all.
	const quotaCalls = postMessageSpy.mock.calls.filter(
		(c) => c.arguments[0]?.type === "quota-exceeded",
	);
	strictEqual(quotaCalls.length, 0);

	destroy();
});

// *** postMessageEvent offline guard preserves the draining lock (line 183) ***
// When a drain is already in flight (draining === true) and the connection drops
// offline, a concurrent postMessageEvent must take the offline early-return,
// which reschedules the poll via timeout(). The mutated guard (`if (false)` /
// empty block) instead falls through to the `if (draining) return` lock and
// reschedules NOTHING. We observe the synchronous timeout() (setTimeout) of the
// concurrent call.
test("postMessageEvent: offline while draining still reschedules via the offline early-return", async () => {
	globalThis.indexedDB = new IDBFactory();
	const offline = offlineMiddleware({ pollDelay: 60000, statusCodes: [503] });
	const { afterNetwork, postMessageEvent, destroy } = offline;
	await new Promise((resolve) => setTimeout(resolve, 50));

	// Queue one item that we can hold mid-fetch to keep draining === true.
	const request = new Request(`${domain}/200`, {
		method: "POST",
		body: JSON.stringify({ data: "gated" }),
		headers: { "Content-Type": "application/json" },
	});
	const w = [];
	await afterNetwork(request, undefined, { waitUntil: (p) => w.push(p) }, {});
	await Promise.all(w);

	Object.defineProperty(navigator, "onLine", {
		value: true,
		writable: true,
		configurable: true,
	});

	const origFetch = globalThis.fetch;
	let releaseGate;
	const gate = new Promise((resolve) => {
		releaseGate = resolve;
	});
	let gateReached;
	const gateInFlight = new Promise((resolve) => {
		gateReached = resolve;
	});
	globalThis.fetch = async (req) => {
		gateReached();
		await gate;
		return origFetch(req);
	};

	const origSetTimeout = globalThis.setTimeout;
	let pollTimerScheduled = 0;
	const pollTimerIds = [];
	globalThis.setTimeout = (fn, delay, ...rest) => {
		const id = origSetTimeout(fn, delay, ...rest);
		if (fn === postMessageEvent) {
			pollTimerScheduled++;
			// Cancel the 60s poll timers so they cannot fire postMessageEvent after
			// destroy() closes the database.
			pollTimerIds.push(id);
		}
		return id;
	};

	try {
		// Start drain #1; it enters the gated fetch and parks with draining === true.
		const firstDrain = postMessageEvent();
		await gateInFlight;

		// Drop offline, then fire a concurrent trigger. Reset the counter so we only
		// observe what THIS call schedules synchronously before its first await.
		Object.defineProperty(navigator, "onLine", {
			value: false,
			writable: true,
			configurable: true,
		});
		pollTimerScheduled = 0;
		const secondDrain = postMessageEvent();

		// Real code: offline branch -> return timeout() -> one poll timer armed.
		// Mutant: falls through, hits the draining lock, returns WITHOUT scheduling.
		strictEqual(pollTimerScheduled, 1);

		// Let everything unwind cleanly.
		Object.defineProperty(navigator, "onLine", {
			value: true,
			writable: true,
			configurable: true,
		});
		releaseGate();
		await Promise.all([firstDrain, secondDrain]);
	} finally {
		globalThis.setTimeout = origSetTimeout;
		globalThis.fetch = origFetch;
		destroy();
		for (const id of pollTimerIds) clearTimeout(id);
	}
});

// *** drain catch logs the transient error (line 222) ***
// A fetch THROW during drain is caught; the catch body must call consoleError so
// the failure is surfaced (and not silently swallowed). Removing the catch body
// would still stop the drain but log nothing.
test("postMessageEvent: logs via console.error when a drain fetch throws", async (t) => {
	const errorSpy = t.mock.method(console, "error", () => {});
	const { afterNetwork, postMessageEvent, destroy } = await createOffline({
		pollDelay: 0,
		statusCodes: [503],
	});

	const request = new Request(`${domain}/503`, {
		method: "POST",
		body: JSON.stringify({ data: "boom" }),
		headers: { "Content-Type": "application/json" },
	});
	const waitUntils = [];
	const event = { waitUntil: (p) => waitUntils.push(p) };
	await afterNetwork(request, new Response("", { status: 503 }), event, {});
	await Promise.all(waitUntils);

	const origFetch = globalThis.fetch;
	const thrown = new Error("network failure");
	globalThis.fetch = () => {
		throw thrown;
	};
	Object.defineProperty(navigator, "onLine", {
		value: true,
		writable: true,
		configurable: true,
	});

	const before = errorSpy.mock.callCount();
	await postMessageEvent();
	// The catch body ran consoleError(e) with the thrown error.
	strictEqual(errorSpy.mock.callCount(), before + 1);
	strictEqual(errorSpy.mock.calls[before].arguments[0], thrown);

	globalThis.fetch = origFetch;
	destroy();
});

// *** draining lock resets after a full drain (lines 226-227) ***
// The `finally { draining = false }` must reset the lock so a LATER drain can
// run. If the lock is left true (block removed) or set true again, the second
// drain becomes a permanent no-op and its queued item is never replayed.
test("postMessageEvent: a fresh drain after an earlier one still replays the next item", async () => {
	const { afterNetwork, postMessageEvent, destroy } = await createOffline({
		pollDelay: 0,
		statusCodes: [503],
	});

	const enqueue = async (path, payload) => {
		const request = new Request(`${domain}${path}`, {
			method: "POST",
			body: JSON.stringify(payload),
			headers: { "Content-Type": "application/json" },
		});
		const w = [];
		await afterNetwork(request, undefined, { waitUntil: (p) => w.push(p) }, {});
		await Promise.all(w);
	};

	Object.defineProperty(navigator, "onLine", {
		value: true,
		writable: true,
		configurable: true,
	});

	// First drain: enqueue A and replay it. This sets draining true then (on real
	// code) resets it in the finally block.
	await enqueue("/200", { item: "A" });
	await postMessageEvent();
	strictEqual(await countStore(), 0);

	// Second, completely separate drain: enqueue B and replay it. This only works
	// if the lock was reset; otherwise `if (draining) return` short-circuits.
	const fetchCalls = [];
	const origFetch = globalThis.fetch;
	globalThis.fetch = (req) => {
		fetchCalls.push(req.url);
		return origFetch(req);
	};
	await enqueue("/en/200", { item: "B" });
	await postMessageEvent();
	globalThis.fetch = origFetch;

	strictEqual(fetchCalls.includes(`${domain}/en/200`), true);
	strictEqual(await countStore(), 0);
	destroy();
});

// *** textContentType: a body with no content-type is treated as text (line 256) ***
// `!ct || ct.startsWith(...)` must short-circuit on a missing content-type so it
// never calls `.startsWith` on undefined. A Uint8Array body produces a Request
// with NO content-type. Real code encodes it as text; the `!ct && ...` and
// `false || ...` mutants instead invoke undefined.startsWith and throw.
test("idbSerializeRequest: a body with no content-type serializes as text", async () => {
	const request = new Request(`${domain}/200`, {
		method: "POST",
		body: new Uint8Array([104, 105]), // "hi"; raw bytes get no content-type
	});
	strictEqual(request.headers.get("content-type"), null);

	const serialized = await idbSerializeRequest(request);

	// Real code: textContentType(undefined) -> true -> text encoding.
	strictEqual(serialized.body.encoding, "text");
	strictEqual(serialized.body.data, "hi");
});

// *** textContentType: prefix match, not suffix (lines 257-260) ***
// Each `ct.startsWith(prefix)` must match a PREFIX. With a charset suffix the
// content-type starts with the media type but does not end with it, so the
// startsWith->endsWith mutants would misclassify the body as binary (base64).
test("idbSerializeRequest: prefix content-types with a charset suffix serialize as text", async () => {
	const prefixes = [
		"text/plain",
		"application/json; charset=utf-8",
		"application/javascript; charset=utf-8",
		"application/xml; charset=utf-8",
	];
	for (const ct of prefixes) {
		const request = new Request(`${domain}/200`, {
			method: "POST",
			headers: new Headers({ "Content-Type": ct }),
			body: "payload",
		});
		const serialized = await idbSerializeRequest(request);
		// Real: startsWith matches -> text. Mutant endsWith(prefix) is false and no
		// other clause matches -> base64.
		strictEqual(serialized.body.encoding, "text", `expected text for ${ct}`);
		strictEqual(serialized.body.data, "payload", `expected data for ${ct}`);
	}
});

// *** idbSerializeRequest: each Request property is copied through (lines 284-291) ***
// The property loop copies a fixed set of Request fields. Blanking any name (""
// instead of e.g. "referrer") drops that field from the serialized output.
test("idbSerializeRequest: copies referrer/mode/credentials/cache/redirect/etc. from the request", async () => {
	const request = new Request(`${domain}/200`, {
		method: "POST",
		headers: new Headers({ "Content-Type": "text/plain" }),
		body: "x",
	});
	const serialized = await idbSerializeRequest(request);

	// Compare against the live Request values; the StringLiteral "" mutants drop
	// the property (undefined) which never equals the real value (including the
	// empty-string and boolean defaults).
	for (const property of [
		"referrer",
		"referrerPolicy",
		"mode",
		"credentials",
		"cache",
		"integrity",
		"keepalive",
		"redirect",
	]) {
		strictEqual(
			serialized[property],
			request[property],
			`expected serialized.${property} to match request.${property}`,
		);
	}
});

// *** idbSerializeRequest: undefined properties are omitted, not copied (line 293) ***
// The `request[property] !== undefined` guard must skip absent fields. Given a
// plain object lacking the optional fields, real code omits them; the `if (true)`
// mutant would copy them through as `undefined` keys.
test("idbSerializeRequest: omits properties that are undefined on the input", async () => {
	// A minimal request-like object: only method and url are defined.
	const serialized = await idbSerializeRequest({
		method: "POST",
		url: `${domain}/200`,
	});

	strictEqual(serialized.method, "POST");
	strictEqual(serialized.url, `${domain}/200`);
	// Real: these were undefined on the input -> the guard skips them, so the keys
	// are absent. The `if (true)` mutant copies them as `undefined` keys.
	strictEqual("referrer" in serialized, false);
	strictEqual("mode" in serialized, false);
	strictEqual("redirect" in serialized, false);
});

// *** idbDeserializeRequest: only the {encoding,data} envelope is decoded (line 317) ***
// The triple guard `body && typeof body === "object" && typeof body.encoding ===
// "string"` decides whether to decode. The following cases pin down each clause.

test("idbDeserializeRequest: a plain string body is passed through untouched", async () => {
	// body is a string (not the envelope) -> guard false -> used as-is.
	// Kills `if (true)` and the first `&&`->`||` (both would enter and read
	// `.data` off the string, yielding undefined -> no body).
	const request = idbDeserializeRequest({
		method: "POST",
		url: `${domain}/200`,
		body: "raw-string",
	});
	strictEqual(await request.text(), "raw-string");
});

test("idbDeserializeRequest: a null body produces a request with no body and does not throw", async () => {
	// body is null -> guard short-circuits at the first clause. Kills the second
	// `&&`->`||` and the `(body && typeof body === object)`->true mutants, both of
	// which evaluate `null.encoding` and throw.
	const request = idbDeserializeRequest({
		method: "POST",
		url: `${domain}/200`,
		body: null,
	});
	strictEqual(request.body, null);
	strictEqual(await request.text(), "");
});

test("idbDeserializeRequest: an object whose encoding is not a string is NOT decoded", async () => {
	// encoding is a number -> the third clause is false -> the object is passed
	// through unchanged (a Request stringifies it). Kills the `typeof body.encoding
	// === "string"`->true mutant, which would enter and return body.data.
	const request = idbDeserializeRequest({
		method: "POST",
		url: `${domain}/200`,
		body: { encoding: 123, data: "DATA" },
	});
	// The object was passed straight to Request, NOT decoded to "DATA".
	strictEqual(await request.text(), "[object Object]");
});

test("idbDeserializeRequest: a non-object body with a string encoding is still not decoded", async () => {
	// A function whose `encoding` is a string: `typeof body === "object"` is false
	// so real code does NOT decode it (the Request stringifies the function). Only
	// the `typeof body === "object"`->true mutant would enter and return body.data.
	const fnBody = () => {};
	fnBody.encoding = "text";
	fnBody.data = "FN_DATA";
	const request = idbDeserializeRequest({
		method: "POST",
		url: `${domain}/200`,
		body: fnBody,
	});
	const text = await request.text();
	notStrictEqual(text, "FN_DATA");
	ok(text.includes("=>"), `expected the function source, got ${text}`);
});

// *** idbDeserializeRequest: the text envelope is decoded to its data string ***
// Complements the binary (base64) roundtrip above by pinning the text branch of
// the encoding ternary.
test("idbDeserializeRequest: a text-encoded envelope yields the data string", async () => {
	const request = idbDeserializeRequest({
		method: "POST",
		url: `${domain}/200`,
		body: { encoding: "text", data: "hello-text" },
	});
	strictEqual(await request.text(), "hello-text");
});
