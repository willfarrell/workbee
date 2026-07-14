/* global Headers Request Response */

import { deepEqual, strictEqual } from "node:assert";
import test from "node:test";
import {
	compileConfig,
	fetchStrategy,
	strategyCacheOnly,
	strategyNetworkFirst,
} from "@work-bee/core";
import { domain, setupMocks } from "../../fixtures/helper.js";
import saveDataMiddleware from "./index.js";

test("saveDataMiddleware.before: Should skip when Save-Data header not set", async (_t) => {
	const request = new Request(`${domain}/200`, {
		method: "GET",
		headers: new Headers({}),
	});

	const saveData = saveDataMiddleware({
		saveDataStrategy: strategyCacheOnly,
	});
	const { event, config } = setupMocks(strategyNetworkFirst, `${domain}/200`);
	await saveData.before(request, event, config);

	deepEqual(config.strategy, strategyNetworkFirst);
});

test("saveDataMiddleware.before: Should override strategy when Save-Data header is set", async (_t) => {
	const request = new Request(`${domain}/200`, {
		method: "GET",
		headers: new Headers({ "Save-Data": "on" }),
	});

	const saveData = saveDataMiddleware({
		saveDataStrategy: strategyCacheOnly,
	});
	const { event, config } = setupMocks(strategyNetworkFirst, `${domain}/200`);
	await saveData.before(request, event, config);

	deepEqual(config.strategy, strategyCacheOnly);
});

test("saveDataMiddleware.before: Should skip when Save-Data header not set (no options)", async (_t) => {
	const request = new Request(`${domain}/200`, {
		method: "GET",
		headers: new Headers({ "Save-Data": "on" }),
	});

	const saveData = saveDataMiddleware();
	const { event, config } = setupMocks(strategyNetworkFirst, `${domain}/200`);
	await saveData.before(request, event, config);

	deepEqual(config.strategy, strategyCacheOnly);
});

test("saveDataMiddleware.after: Should restore original strategy after Save-Data override", async (_t) => {
	const request = new Request(`${domain}/200`, {
		method: "GET",
		headers: new Headers({ "Save-Data": "on" }),
	});
	const response = new Response("", { status: 200 });

	const saveData = saveDataMiddleware({
		saveDataStrategy: strategyCacheOnly,
	});
	const { event, config } = setupMocks(strategyNetworkFirst, `${domain}/200`);

	// before overrides strategy
	await saveData.before(request, event, config);
	deepEqual(config.strategy, strategyCacheOnly);

	// after restores it
	const result = saveData.after(request, response, event, config);
	deepEqual(config.strategy, strategyNetworkFirst);
	deepEqual(result, response);
});

test("saveDataMiddleware.after: Should not change strategy when Save-Data was not set", async (_t) => {
	const request = new Request(`${domain}/200`, {
		method: "GET",
		headers: new Headers({}),
	});
	const response = new Response("", { status: 200 });

	const saveData = saveDataMiddleware({
		saveDataStrategy: strategyCacheOnly,
	});
	const { event, config } = setupMocks(strategyNetworkFirst, `${domain}/200`);

	// before does not override
	await saveData.before(request, event, config);
	deepEqual(config.strategy, strategyNetworkFirst);

	// after should still work fine
	const result = saveData.after(request, response, event, config);
	deepEqual(result, response);
});

test("saveDataMiddleware.after: Should leave strategy untouched when before never ran for the event", async (_t) => {
	// `after` may fire for an event that this middleware instance never saw in
	// `before` (e.g. a different middleware short-circuited). With no recorded
	// original strategy, `after` must NOT touch config.strategy — clobbering it
	// to `undefined` would break the route for that request.
	const request = new Request(`${domain}/200`, {
		method: "GET",
		headers: new Headers({}),
	});
	const response = new Response("", { status: 200 });

	const saveData = saveDataMiddleware({
		saveDataStrategy: strategyCacheOnly,
	});
	const { event, config } = setupMocks(strategyNetworkFirst, `${domain}/200`);

	// Note: `before` is intentionally NOT called, so no original strategy is
	// recorded for `event`.
	const result = saveData.after(request, response, event, config);

	strictEqual(config.strategy, strategyNetworkFirst);
	deepEqual(result, response);
});

test("saveDataMiddleware: never mutates the shared route config", async (_t) => {
	// Capture the shared config's strategy *while* the swapped strategy runs.
	// fetchStrategy isolates a per-request copy, so the save-data swap must
	// never reach the shared route config — otherwise concurrent fetch events
	// could corrupt each other's strategy.
	let observedSharedStrategy;
	const saveDataStrategy = async () => {
		observedSharedStrategy = config.strategy;
		return new Response("", { status: 200 });
	};
	const saveData = saveDataMiddleware({ saveDataStrategy });
	const config = compileConfig({
		strategy: strategyNetworkFirst,
		middlewares: [saveData],
	});
	const request = new Request(`${domain}/200`, {
		headers: new Headers({ "Save-Data": "on" }),
	});
	const event = { waitUntil: () => {} };

	await fetchStrategy(request, event, config);

	strictEqual(observedSharedStrategy, strategyNetworkFirst);
	strictEqual(config.strategy, strategyNetworkFirst);
});
