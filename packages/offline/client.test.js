import { strictEqual } from "node:assert";
import { afterEach, beforeEach, mock, suite, test } from "node:test";

// Mock browser APIs
let onlineHandler;
const mockWindow = {
	addEventListener: (name, handler) => {
		if (name === "online") onlineHandler = handler;
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

const { default: initClient } = await import("./client.js");

// Scope the per-test global swapping inside a suite. node:test's top-level
// beforeEach/afterEach attach to the ROOT context, so under Stryker's node-test
// runner — which loads the whole corpus into one process (isolation:'none') —
// every file's top-level hooks would run before/after EVERY test in EVERY file,
// and the last-registered `navigator` setter would win (e.g. inactivity/client's),
// routing this file's postMessage to a sibling's mock. A suite keeps the hooks
// local to these tests. `navigator` is a read-only accessor by default in Node,
// so it must be (re)defined, not assigned.
suite("offline client", () => {
	let savedWindow;
	let savedNavigator;
	beforeEach(() => {
		savedWindow = globalThis.window;
		savedNavigator = globalThis.navigator;
		globalThis.window = mockWindow;
		Object.defineProperty(globalThis, "navigator", {
			value: mockNavigator,
			writable: true,
			configurable: true,
		});
	});
	afterEach(() => {
		globalThis.window = savedWindow;
		Object.defineProperty(globalThis, "navigator", {
			value: savedNavigator,
			writable: true,
			configurable: true,
		});
	});

	test("registers online event listener", () => {
		initClient();
		strictEqual(typeof onlineHandler, "function");
	});

	test("posts message on online event", () => {
		mockPostMessage.mock.resetCalls();
		onlineHandler();
		strictEqual(mockPostMessage.mock.callCount(), 1);
		strictEqual(mockPostMessage.mock.calls[0].arguments[0].type, "online");
	});

	test("handles missing service worker controller gracefully", () => {
		const savedNav = globalThis.navigator;
		globalThis.navigator = { serviceWorker: { controller: null } };
		onlineHandler(); // Should not throw
		globalThis.navigator = savedNav;
	});

	test("handles missing service worker gracefully", () => {
		const savedNav = globalThis.navigator;
		globalThis.navigator = {};
		onlineHandler(); // Should not throw
		globalThis.navigator = savedNav;
	});

	test("returns cleanup function that removes listener", () => {
		let addedName, addedHandler;
		let removedName, removedHandler;
		const cleanupWindow = {
			addEventListener: (name, handler) => {
				addedName = name;
				addedHandler = handler;
			},
			removeEventListener: (name, handler) => {
				removedName = name;
				removedHandler = handler;
			},
		};
		globalThis.window = cleanupWindow;

		const cleanup = initClient();
		strictEqual(typeof cleanup, "function");
		strictEqual(addedName, "online");

		cleanup();
		strictEqual(removedName, "online");
		strictEqual(removedHandler, addedHandler);

		globalThis.window = mockWindow;
	});
});
