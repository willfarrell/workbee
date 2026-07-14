/* global Request */

import { strictEqual } from "node:assert";
import { mock, test } from "node:test";
import { cachesOverride, fetchOverride } from "../../fixtures/helper.js";
import inactivityMiddleware from "./index.js";

// Mocks
Object.assign(global, { caches: cachesOverride, fetch: fetchOverride });

test("inactivityMiddleware: Should trigger inactivityEvent with no activity", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const inactivityEvent = mock.fn(() => {});
	const _inactivity = inactivityMiddleware({
		inactivityAllowedInMin: 15,
		inactivityEvent,
	});
	strictEqual(inactivityEvent.mock.callCount(), 0);
	t.mock.timers.tick(15 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 1);
});

test("inactivityMiddleware: Should trigger inactivityEvent after request happens", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const inactivityEvent = mock.fn(() => {});
	const inactivity = inactivityMiddleware({
		inactivityAllowedInMin: 15,
		inactivityEvent,
	});
	t.mock.timers.tick(10 * 60 * 1000);

	inactivity.before();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	inactivity.after();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	t.mock.timers.tick(10 * 60 * 1000);
	strictEqual(inactivityEvent.mock.callCount(), 0);

	t.mock.timers.tick(15 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 1);
});

test("inactivityMiddleware: Should trigger inactivityEvent after requests happen in series", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const inactivityEvent = mock.fn(() => {});
	const inactivity = inactivityMiddleware({
		inactivityAllowedInMin: 15,
		inactivityEvent,
	});
	t.mock.timers.tick(10 * 60 * 1000);

	inactivity.before();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	t.mock.timers.tick(15 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 0);
	inactivity.after();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	t.mock.timers.tick(10 * 60 * 1000);
	strictEqual(inactivityEvent.mock.callCount(), 0);

	inactivity.before();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	inactivity.after();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	t.mock.timers.tick(10 * 60 * 1000);
	strictEqual(inactivityEvent.mock.callCount(), 0);

	t.mock.timers.tick(15 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 1);
});

test("inactivityMiddleware: Should trigger inactivityEvent after requests happen in parallel", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const inactivityEvent = mock.fn(() => {});
	const inactivity = inactivityMiddleware({
		inactivityAllowedInMin: 15,
		inactivityEvent,
	});
	t.mock.timers.tick(10 * 60 * 1000);

	inactivity.before();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	t.mock.timers.tick(15 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 0);

	inactivity.before();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	inactivity.after();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	t.mock.timers.tick(15 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 0);

	inactivity.after();
	strictEqual(inactivityEvent.mock.callCount(), 0);
	t.mock.timers.tick(10 * 60 * 1000);
	strictEqual(inactivityEvent.mock.callCount(), 0);

	t.mock.timers.tick(15 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 1);
});

test("inactivityMiddleware: Should warn via default inactivityEvent when none provided", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	t.mock.method(console, "warn", () => {});
	const _inactivity = inactivityMiddleware({
		inactivityAllowedInMin: 15,
	});
	t.mock.timers.tick(15 * 60 * 1000 + 1);
	strictEqual(console.warn.mock.callCount(), 1);
	strictEqual(
		console.warn.mock.calls[0].arguments[0],
		"@work-bee/inactivity: inactivity threshold reached but no `inactivityEvent` callback was provided",
	);
});

test("inactivityMiddleware: after() for an event whose before() was skipped does not wedge the timer", async (t) => {
	// Core runs after-hooks even when an earlier before-hook threw, so our
	// after can fire for an event our before never saw. Without per-event
	// pairing this drives requestCount negative, making `!requestCount` false
	// forever so the inactivity timer never re-arms.
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const inactivityEvent = mock.fn(() => {});
	const inactivity = inactivityMiddleware({
		inactivityAllowedInMin: 15,
		inactivityEvent,
	});

	const skippedEvent = {};
	// before() was skipped for this event (an earlier before-hook threw); only
	// after() runs. With the fix this is a no-op on the counter.
	inactivity.after(undefined, undefined, skippedEvent);

	// A subsequent balanced request must still leave the timer able to fire.
	const pairedEvent = {};
	inactivity.before(undefined, pairedEvent);
	inactivity.after(undefined, undefined, pairedEvent);

	t.mock.timers.tick(15 * 60 * 1000 + 1);
	// Pre-fix: requestCount === -1, guard falsy, callCount stays 0.
	strictEqual(inactivityEvent.mock.callCount(), 1);
});

test("inactivityMiddleware: Should trigger inactivityEvent after postMessageEvent happens", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const inactivityEvent = mock.fn(() => {});
	const inactivity = inactivityMiddleware({
		inactivityAllowedInMin: 15,
		inactivityEvent,
	});
	t.mock.timers.tick(10 * 60 * 1000);

	inactivity.postMessageEvent(); // client non-network activity

	strictEqual(inactivityEvent.mock.callCount(), 0);
	t.mock.timers.tick(5 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 0);
	t.mock.timers.tick(10 * 60 * 1000 + 1);
	strictEqual(inactivityEvent.mock.callCount(), 1);
});
