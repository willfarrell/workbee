import { doesNotThrow, strictEqual } from "node:assert";
import { mock, test } from "node:test";

// Mock browser APIs
const listeners = {};
const mockDocument = {
	addEventListener: (name, handler, capture) => {
		listeners[name] = { handler, capture };
	},
};
const mockPostMessage = mock.fn();
const mockNavigator = {
	serviceWorker: {
		controller: {
			postMessage: mockPostMessage,
		},
	},
};

Object.defineProperty(globalThis, "document", {
	value: mockDocument,
	writable: true,
	configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
	value: mockNavigator,
	writable: true,
	configurable: true,
});

const { default: initClient } = await import("./client.js");

test("inactivity client: registers default event listeners", () => {
	initClient();
	const expectedEvents = [
		"load",
		"keypress",
		"mousedown",
		"mousemove",
		"scroll",
		"touchmove",
		"touchstart",
		"visibilitychange",
		"wheel",
	];
	for (const event of expectedEvents) {
		strictEqual(event in listeners, true, `Missing listener for ${event}`);
		strictEqual(listeners[event].capture, true, `${event} should use capture`);
	}
});

test("inactivity client: registers custom event listeners", () => {
	const customListeners = {};
	const customDoc = {
		addEventListener: (name, handler, capture) => {
			customListeners[name] = { handler, capture };
		},
	};
	globalThis.document = customDoc;

	initClient(["click", "keydown"]);
	strictEqual("click" in customListeners, true);
	strictEqual("keydown" in customListeners, true);

	globalThis.document = mockDocument;
});

test("inactivity client: posts message on activity", () => {
	mockPostMessage.mock.resetCalls();
	const handler = listeners.mousedown.handler;
	handler();
	strictEqual(mockPostMessage.mock.callCount(), 1);
	strictEqual(mockPostMessage.mock.calls[0].arguments[0].type, "inactivity");
});

test("inactivity client: throttles activity events within 1 second", () => {
	mockPostMessage.mock.resetCalls();
	const originalDateNow = Date.now;
	// Use a time far in the future to ensure it exceeds any previously set activityTimestamp
	let now = 9_000_000_000_000;
	Date.now = () => now;

	const handler = listeners.mousedown.handler;
	// First call - should fire (well past any previous timestamp)
	handler();
	strictEqual(mockPostMessage.mock.callCount(), 1);

	// Within 1 second - should be throttled
	now = 9_000_000_000_500;
	handler();
	strictEqual(mockPostMessage.mock.callCount(), 1);

	// After 1 second - should fire
	now = 9_000_000_001_001;
	handler();
	strictEqual(mockPostMessage.mock.callCount(), 2);

	Date.now = originalDateNow;
});

test("inactivity client: handles missing service worker controller gracefully", () => {
	// Fresh closure so activityTimestamp starts at 0 and the throttle guard does
	// not short-circuit before the postMessage line — otherwise that line is
	// never reached and `controller?.postMessage` -> `controller.postMessage`
	// (a TypeError on null) would never be exercised.
	const freshListeners = {};
	const freshDoc = {
		addEventListener: (name, handler, capture) => {
			freshListeners[name] = { handler, capture };
		},
	};
	globalThis.document = freshDoc;
	const savedNav = globalThis.navigator;
	globalThis.navigator = { serviceWorker: { controller: null } };

	const originalDateNow = Date.now;
	Date.now = () => 9_999_999;
	initClient(["mousedown"]);
	const handler = freshListeners.mousedown.handler;
	// controller is null: real `controller?.postMessage` short-circuits to
	// undefined; the mutant `controller.postMessage` throws on null.
	doesNotThrow(handler);
	Date.now = originalDateNow;

	globalThis.navigator = savedNav;
	globalThis.document = mockDocument;
});

test("inactivity client: handles missing service worker gracefully", () => {
	const freshListeners = {};
	const freshDoc = {
		addEventListener: (name, handler, capture) => {
			freshListeners[name] = { handler, capture };
		},
	};
	globalThis.document = freshDoc;
	const savedNav = globalThis.navigator;
	globalThis.navigator = {};

	const originalDateNow = Date.now;
	Date.now = () => 19_999_999;
	initClient(["mousedown"]);
	const handler = freshListeners.mousedown.handler;
	// serviceWorker is undefined: real `serviceWorker?.controller` short-circuits;
	// the mutant `serviceWorker.controller` throws on undefined.
	doesNotThrow(handler);
	Date.now = originalDateNow;

	globalThis.navigator = savedNav;
	globalThis.document = mockDocument;
});

test("inactivity client: fires (does not throttle) at exactly the 1000ms boundary", () => {
	// Boundary for `activityTimestamp + 1000 > now`. After the first event sets
	// activityTimestamp = T0, an event at exactly T0 + 1000 makes the guard
	// `T0+1000 > T0+1000` false -> it FIRES. The `>` -> `>=` mutant would make it
	// `T0+1000 >= T0+1000` true -> throttled, so the second message is suppressed.
	const freshListeners = {};
	const freshDoc = {
		addEventListener: (name, handler, capture) => {
			freshListeners[name] = { handler, capture };
		},
	};
	globalThis.document = freshDoc;
	const savedNav = globalThis.navigator;
	const post = mock.fn();
	globalThis.navigator = {
		serviceWorker: { controller: { postMessage: post } },
	};

	const originalDateNow = Date.now;
	const t0 = 5_000_000;
	Date.now = () => t0;
	initClient(["mousedown"]);
	const handler = freshListeners.mousedown.handler;
	handler(); // first event fires, activityTimestamp = t0
	strictEqual(post.mock.callCount(), 1);

	// Exactly 1000ms later: real code fires (count 2), `>=` mutant throttles (1).
	Date.now = () => t0 + 1000;
	handler();
	strictEqual(post.mock.callCount(), 2);

	Date.now = originalDateNow;
	globalThis.navigator = savedNav;
	globalThis.document = mockDocument;
});

test("inactivity client: returns cleanup function that removes listeners", () => {
	const added = [];
	const removed = [];
	const cleanupDoc = {
		addEventListener: (name, handler, capture) => {
			added.push({ name, handler, capture });
		},
		removeEventListener: (name, handler, capture) => {
			removed.push({ name, handler, capture });
		},
	};
	globalThis.document = cleanupDoc;

	const cleanup = initClient(["click", "keydown"]);
	strictEqual(typeof cleanup, "function");
	strictEqual(added.length, 2);
	strictEqual(removed.length, 0);

	cleanup();
	strictEqual(removed.length, 2);
	// Verify same handler references were removed
	for (let i = 0; i < added.length; i++) {
		strictEqual(removed[i].name, added[i].name);
		strictEqual(removed[i].handler, added[i].handler);
		strictEqual(removed[i].capture, added[i].capture);
	}

	globalThis.document = mockDocument;
});
