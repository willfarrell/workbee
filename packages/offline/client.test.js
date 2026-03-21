import { strictEqual } from "node:assert";
import { mock, test } from "node:test";

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

Object.defineProperty(globalThis, "window", {
	value: mockWindow,
	writable: true,
	configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
	value: mockNavigator,
	writable: true,
	configurable: true,
});

const { default: initClient } = await import("./client.js");

test("offline client: registers online event listener", () => {
	initClient();
	strictEqual(typeof onlineHandler, "function");
});

test("offline client: posts message on online event", () => {
	mockPostMessage.mock.resetCalls();
	onlineHandler();
	strictEqual(mockPostMessage.mock.callCount(), 1);
	strictEqual(mockPostMessage.mock.calls[0].arguments[0].type, "online");
});

test("offline client: handles missing service worker controller gracefully", () => {
	const savedNav = globalThis.navigator;
	globalThis.navigator = { serviceWorker: { controller: null } };
	onlineHandler(); // Should not throw
	globalThis.navigator = savedNav;
});

test("offline client: handles missing service worker gracefully", () => {
	const savedNav = globalThis.navigator;
	globalThis.navigator = {};
	onlineHandler(); // Should not throw
	globalThis.navigator = savedNav;
});
