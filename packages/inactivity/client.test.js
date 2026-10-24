/* global BroadcastChannel EventTarget Event MessageEvent */
import { deepEqual, doesNotThrow, strictEqual } from "node:assert";
import { afterEach, beforeEach, mock, suite, test } from "node:test";

const { default: inactivityClient } = await import("./client.js");

const windowMs = 15 * 60 * 1000;

// Scope the per-test global swapping inside a suite. node:test's top-level
// beforeEach/afterEach attach to the ROOT context, so under Stryker's node-test
// runner — which loads the whole corpus into one process (isolation:'none') —
// every file's top-level hooks would run before/after EVERY test in EVERY file.
// A suite keeps the hooks local to these tests. `navigator` is a read-only
// accessor by default in Node, so it must be (re)defined, not assigned.
suite("inactivity client", () => {
	let savedDocument;
	let savedNavigator;
	let serviceWorker;
	const setNavigator = (value) => {
		Object.defineProperty(globalThis, "navigator", {
			value,
			writable: true,
			configurable: true,
		});
	};
	const swMessage = (data) =>
		serviceWorker.dispatchEvent(new MessageEvent("message", { data }));
	const domEvent = (name) => document.dispatchEvent(new Event(name));

	beforeEach((t) => {
		t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
		savedDocument = globalThis.document;
		savedNavigator = globalThis.navigator;
		serviceWorker = new EventTarget();
		globalThis.document = new EventTarget();
		setNavigator({ serviceWorker });
	});
	afterEach(() => {
		globalThis.document = savedDocument;
		setNavigator(savedNavigator);
	});

	test("calls inactivityEvent once the window lapses with no activity", (t) => {
		const inactivityEvent = mock.fn();
		const cleanup = inactivityClient({ inactivityEvent });

		t.mock.timers.tick(windowMs - 1);
		strictEqual(inactivityEvent.mock.callCount(), 0);
		t.mock.timers.tick(1);
		strictEqual(inactivityEvent.mock.callCount(), 1);
		cleanup();
	});

	test("honours inactivityAllowedInMin", (t) => {
		const inactivityEvent = mock.fn();
		const cleanup = inactivityClient({
			inactivityAllowedInMin: 0.05,
			inactivityEvent,
		});

		t.mock.timers.tick(2999);
		strictEqual(inactivityEvent.mock.callCount(), 0);
		t.mock.timers.tick(1);
		strictEqual(inactivityEvent.mock.callCount(), 1);
		cleanup();
	});

	test("DOM activity pushes the deadline out by a full window", (t) => {
		const inactivityEvent = mock.fn();
		const cleanup = inactivityClient({ inactivityEvent });

		t.mock.timers.tick(10 * 60 * 1000);
		domEvent("mousedown");
		t.mock.timers.tick(windowMs - 1);
		strictEqual(inactivityEvent.mock.callCount(), 0);
		t.mock.timers.tick(1);
		strictEqual(inactivityEvent.mock.callCount(), 1);
		cleanup();
	});

	test("activity messages from the ServiceWorker count as activity", (t) => {
		const inactivityEvent = mock.fn();
		const cleanup = inactivityClient({ inactivityEvent });

		t.mock.timers.tick(10 * 60 * 1000);
		swMessage({ type: "inactivity-activity" });
		t.mock.timers.tick(windowMs - 1);
		strictEqual(inactivityEvent.mock.callCount(), 0);
		t.mock.timers.tick(1);
		strictEqual(inactivityEvent.mock.callCount(), 1);
		cleanup();
	});

	test("ignores unrelated ServiceWorker messages", (t) => {
		const inactivityEvent = mock.fn();
		const cleanup = inactivityClient({ inactivityEvent });

		t.mock.timers.tick(10 * 60 * 1000);
		swMessage({ type: "offline-enqueue" });
		swMessage(null);
		t.mock.timers.tick(5 * 60 * 1000);
		strictEqual(inactivityEvent.mock.callCount(), 1);
		cleanup();
	});

	test("fires again after a new period of activity then inactivity", (t) => {
		const inactivityEvent = mock.fn();
		const cleanup = inactivityClient({ inactivityEvent });

		t.mock.timers.tick(windowMs);
		strictEqual(inactivityEvent.mock.callCount(), 1);
		// Idle past the lapse: no repeat notification without new activity.
		t.mock.timers.tick(windowMs * 2);
		strictEqual(inactivityEvent.mock.callCount(), 1);

		domEvent("keydown");
		t.mock.timers.tick(windowMs);
		strictEqual(inactivityEvent.mock.callCount(), 2);
		cleanup();
	});

	test("listens to the default activity events as passive capture listeners", () => {
		const added = [];
		globalThis.document = {
			addEventListener: (name, _handler, options) =>
				added.push({ name, options }),
			removeEventListener: () => {},
		};
		const cleanup = inactivityClient({ inactivityEvent: () => {} });

		deepEqual(
			added.map(({ name }) => name),
			[
				"load",
				"keydown",
				"mousedown",
				"mousemove",
				"scroll",
				"touchmove",
				"touchstart",
				"visibilitychange",
				"wheel",
			],
		);
		for (const { options } of added) {
			deepEqual(options, { capture: true, passive: true });
		}
		cleanup();
	});

	test("accepts custom activity events", (t) => {
		const inactivityEvent = mock.fn();
		const cleanup = inactivityClient({ inactivityEvent, events: ["click"] });

		t.mock.timers.tick(10 * 60 * 1000);
		domEvent("mousedown"); // not in the custom list
		t.mock.timers.tick(5 * 60 * 1000);
		strictEqual(inactivityEvent.mock.callCount(), 1);

		domEvent("click");
		t.mock.timers.tick(windowMs);
		strictEqual(inactivityEvent.mock.callCount(), 2);
		cleanup();
	});

	test("warns via the default inactivityEvent when none is provided", (t) => {
		const warn = t.mock.method(console, "warn", () => {});
		const cleanup = inactivityClient();

		t.mock.timers.tick(windowMs);
		strictEqual(warn.mock.callCount(), 1);
		strictEqual(
			warn.mock.calls[0].arguments[0],
			"@work-bee/inactivity: inactivity threshold reached but no `inactivityEvent` callback was provided",
		);
		cleanup();
	});

	test("cleanup stops the timer and removes every listener", (t) => {
		const inactivityEvent = mock.fn();
		const cleanup = inactivityClient({ inactivityEvent });

		cleanup();
		domEvent("mousedown");
		swMessage({ type: "inactivity-activity" });
		t.mock.timers.tick(windowMs * 2);
		strictEqual(inactivityEvent.mock.callCount(), 0);
	});

	test("cleanup after a lapse leaves nothing that can re-arm the timer", (t) => {
		const inactivityEvent = mock.fn();
		const cleanup = inactivityClient({ inactivityEvent });
		t.mock.timers.tick(windowMs);
		strictEqual(inactivityEvent.mock.callCount(), 1);

		cleanup();
		domEvent("mousedown");
		swMessage({ type: "inactivity-activity" });
		t.mock.timers.tick(windowMs * 2);
		strictEqual(inactivityEvent.mock.callCount(), 1);
	});

	test("cleanup removes the same DOM handlers it added", () => {
		const added = [];
		const removed = [];
		globalThis.document = {
			addEventListener: (...args) => added.push(args),
			removeEventListener: (...args) => removed.push(args),
		};
		const cleanup = inactivityClient({
			inactivityEvent: () => {},
			events: ["click", "keydown"],
		});
		strictEqual(removed.length, 0);

		cleanup();
		deepEqual(removed, added);
	});

	test("works without ServiceWorker support", (t) => {
		setNavigator({});
		const inactivityEvent = mock.fn();
		let cleanup;
		doesNotThrow(() => {
			cleanup = inactivityClient({ inactivityEvent });
		});

		t.mock.timers.tick(windowMs);
		strictEqual(inactivityEvent.mock.callCount(), 1);
		doesNotThrow(cleanup);
	});

	test("DOM activity in one tab resets the countdown in other tabs", async (t) => {
		// Each tab has its own document; activity is shared over a
		// BroadcastChannel so a user busy in tab A isn't timed out in tab B.
		const deliver = () => new Promise((resolve) => setImmediate(resolve));
		const inactiveA = mock.fn();
		const inactiveB = mock.fn();
		const documentA = new EventTarget();
		globalThis.document = documentA;
		const cleanupA = inactivityClient({ inactivityEvent: inactiveA });
		globalThis.document = new EventTarget();
		const cleanupB = inactivityClient({ inactivityEvent: inactiveB });

		t.mock.timers.tick(windowMs - 1000);
		documentA.dispatchEvent(new Event("keydown"));
		await deliver();
		t.mock.timers.tick(1000);
		strictEqual(inactiveB.mock.callCount(), 0);

		t.mock.timers.tick(windowMs - 1000);
		strictEqual(inactiveA.mock.callCount(), 1);
		strictEqual(inactiveB.mock.callCount(), 1);
		cleanupA();
		cleanupB();
	});

	test("activity broadcast on the @work-bee/inactivity channel resets the countdown", async (t) => {
		// The channel name is the cross-tab contract: any tab (or app code)
		// posting on it counts as activity.
		const inactivityEvent = mock.fn();
		const cleanup = inactivityClient({ inactivityEvent });
		const otherTab = new BroadcastChannel("@work-bee/inactivity");

		t.mock.timers.tick(windowMs - 1);
		otherTab.postMessage(null);
		await new Promise((resolve) => setImmediate(resolve));
		t.mock.timers.tick(1);
		strictEqual(inactivityEvent.mock.callCount(), 0);

		otherTab.close();
		cleanup();
	});

	test("DOM activity is broadcast at most once per second", async (t) => {
		const received = [];
		const otherTab = new BroadcastChannel("@work-bee/inactivity");
		otherTab.onmessage = () => received.push(Date.now());
		const cleanup = inactivityClient({ inactivityEvent: () => {} });
		const deliver = () => new Promise((resolve) => setImmediate(resolve));

		domEvent("mousemove");
		domEvent("mousemove");
		t.mock.timers.tick(999);
		domEvent("mousemove");
		await deliver();
		strictEqual(received.length, 1);

		t.mock.timers.tick(1); // exactly 1000ms after the first broadcast
		domEvent("mousemove");
		await deliver();
		strictEqual(received.length, 2);

		otherTab.close();
		cleanup();
	});
});
