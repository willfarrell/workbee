/* global Request */

import { strictEqual } from "node:assert";
import { mock, test } from "node:test";
import { cachesOverride, fetchOverride } from "../../fixtures/helper.js";
import inactivityMiddleware from "./index.js";

// Mocks
mock.timers.enable({ apis: ["setTimeout"] });
Object.assign(global, { caches: cachesOverride, fetch: fetchOverride });

test("inactivityMiddleware: Should trigger inactivityEvent with no activity", async (_t) => {
	const inactivityEvent = mock.fn(() => {});
	const _inactivity = inactivityMiddleware({
		inactivityAllowedInMin: 15,
		inactivityEvent,
	});
	strictEqual(inactivityEvent.mock.callCount(), 0);
	mock.timers.tick(15 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 1);
});

test("inactivityMiddleware: Should trigger inactivityEvent after request happens", async (_t) => {
	const inactivityEvent = mock.fn(() => {});
	const inactivity = inactivityMiddleware({
		inactivityAllowedInMin: 15,
		inactivityEvent,
	});
	mock.timers.tick(10 * 60 * 1000);

	inactivity.before();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	inactivity.after();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	mock.timers.tick(10 * 60 * 1000);
	strictEqual(inactivityEvent.mock.callCount(), 0);

	mock.timers.tick(15 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 1);
});

test("inactivityMiddleware: Should trigger inactivityEvent after requests happen in series", async (_t) => {
	const inactivityEvent = mock.fn(() => {});
	const inactivity = inactivityMiddleware({
		inactivityAllowedInMin: 15,
		inactivityEvent,
	});
	mock.timers.tick(10 * 60 * 1000);

	inactivity.before();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	mock.timers.tick(15 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 0);
	inactivity.after();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	mock.timers.tick(10 * 60 * 1000);
	strictEqual(inactivityEvent.mock.callCount(), 0);

	inactivity.before();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	inactivity.after();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	mock.timers.tick(10 * 60 * 1000);
	strictEqual(inactivityEvent.mock.callCount(), 0);

	mock.timers.tick(15 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 1);
});

test("inactivityMiddleware: Should trigger inactivityEvent after requests happen in parallel", async (_t) => {
	const inactivityEvent = mock.fn(() => {});
	const inactivity = inactivityMiddleware({
		inactivityAllowedInMin: 15,
		inactivityEvent,
	});
	mock.timers.tick(10 * 60 * 1000);

	inactivity.before();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	mock.timers.tick(15 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 0);

	inactivity.before();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	inactivity.after();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	mock.timers.tick(15 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 0);

	inactivity.after();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	mock.timers.tick(10 * 60 * 1000);
	strictEqual(inactivityEvent.mock.callCount(), 0);

	mock.timers.tick(15 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 1);
});

test("inactivityMiddleware: Should trigger default inactivityEvent when none provided", async (t) => {
	t.mock.method(console, "error", () => {});
	const _inactivity = inactivityMiddleware({
		inactivityAllowedInMin: 15,
	});
	mock.timers.tick(15 * 60 * 1000 + 1);
	strictEqual(console.error.mock.callCount(), 1);
});

test("inactivityMiddleware: Should trigger inactivityEvent after postMessageEvent happens", async (_t) => {
	const inactivityEvent = mock.fn(() => {});
	const inactivity = inactivityMiddleware({
		inactivityAllowedInMin: 15,
		inactivityEvent,
	});
	mock.timers.tick(10 * 60 * 1000);

	inactivity.postMessageEvent(); // client non-network activity

	strictEqual(inactivityEvent.mock.callCount(), 0);
	mock.timers.tick(5 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 0);
	mock.timers.tick(10 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 1);
});
