/* global Request Response */

import { deepEqual, strictEqual } from "node:assert";
import { mock, test } from "node:test";
import {
	cachesOverride,
	domain,
	fetchOverride,
} from "../../fixtures/helper.js";
import inactivityMiddleware from "./index.js";

// Mocks
Object.assign(global, { caches: cachesOverride, fetch: fetchOverride });

const activityMessage = { type: "inactivity-activity" };

test("inactivityMiddleware.before: notifies pages that a request started", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
	const postMessage = mock.fn(async () => {});
	const inactivity = inactivityMiddleware({ postMessage });
	const request = new Request(`${domain}/200`);

	const result = inactivity.before(request, {}, {});

	strictEqual(result, request);
	strictEqual(postMessage.mock.callCount(), 1);
	deepEqual(postMessage.mock.calls[0].arguments[0], activityMessage);
});

test("inactivityMiddleware.after: notifies pages that a request finished", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
	const postMessage = mock.fn(async () => {});
	const inactivity = inactivityMiddleware({ postMessage });
	const response = new Response("");

	const result = inactivity.after(
		new Request(`${domain}/200`),
		response,
		{},
		{},
	);

	strictEqual(result, response);
	strictEqual(postMessage.mock.callCount(), 1);
	deepEqual(postMessage.mock.calls[0].arguments[0], activityMessage);
});

test("inactivityMiddleware: throttles notifications to one per second", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
	const postMessage = mock.fn(async () => {});
	const inactivity = inactivityMiddleware({ postMessage });
	const request = new Request(`${domain}/200`);

	inactivity.before(request, {}, {});
	inactivity.after(request, undefined, {}, {});
	t.mock.timers.tick(999);
	inactivity.before(request, {}, {});
	strictEqual(postMessage.mock.callCount(), 1);

	// Exactly one second after the last notification.
	t.mock.timers.tick(1);
	inactivity.after(request, undefined, {}, {});
	strictEqual(postMessage.mock.callCount(), 2);
});

test("inactivityMiddleware: the first notification is sent even at clock zero", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now: 0 });
	const postMessage = mock.fn(async () => {});
	const inactivity = inactivityMiddleware({ postMessage });

	inactivity.before(new Request(`${domain}/200`), {}, {});

	strictEqual(postMessage.mock.callCount(), 1);
});

test("inactivityMiddleware: defaults to notifying every window client", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
	const clientA = { postMessage: mock.fn() };
	const clientB = { postMessage: mock.fn() };
	const matchAll = mock.fn(async () => [clientA, clientB]);
	const savedClients = globalThis.clients;
	globalThis.clients = { matchAll };
	t.after(() => {
		globalThis.clients = savedClients;
	});
	const inactivity = inactivityMiddleware();

	inactivity.before(new Request(`${domain}/200`), {}, {});
	await new Promise((resolve) => setImmediate(resolve));

	deepEqual(clientA.postMessage.mock.calls[0].arguments[0], activityMessage);
	deepEqual(clientB.postMessage.mock.calls[0].arguments[0], activityMessage);
});

test("inactivityMiddleware: a failed notification is logged, not thrown", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
	const consoleErrorMock = t.mock.method(console, "error", () => {});
	const error = new Error("no clients");
	const inactivity = inactivityMiddleware({
		postMessage: async () => {
			throw error;
		},
	});

	inactivity.before(new Request(`${domain}/200`), {}, {});
	await new Promise((resolve) => setImmediate(resolve));

	strictEqual(consoleErrorMock.mock.callCount(), 1);
	strictEqual(consoleErrorMock.mock.calls[0].arguments[0], error);
});
