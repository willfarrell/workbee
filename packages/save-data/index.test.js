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

test("saveDataMiddleware.before: Should keep the strategy for non-GET/HEAD requests", async (_t) => {
	// A cache-only POST would never reach the network.
	const request = new Request(`${domain}/200`, {
		method: "POST",
		headers: new Headers({ "Save-Data": "on" }),
	});

	const saveData = saveDataMiddleware();
	const { event, config } = setupMocks(strategyNetworkFirst, `${domain}/200`);
	await saveData.before(request, event, config);

	deepEqual(config.strategy, strategyNetworkFirst);
});

test("saveDataMiddleware.before: Should override strategy for HEAD requests", async (_t) => {
	const request = new Request(`${domain}/200`, {
		method: "HEAD",
		headers: new Headers({ "Save-Data": "on" }),
	});

	const saveData = saveDataMiddleware();
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

test("saveDataMiddleware: a following non-Save-Data request uses the original strategy", async (_t) => {
	// fetchStrategy hands each request its own config copy, so the override in
	// `before` is scoped to the Save-Data request and needs no restore step.
	const calls = [];
	const saveDataStrategy = async () => {
		calls.push("saveData");
		return new Response("", { status: 200 });
	};
	const originalStrategy = async () => {
		calls.push("original");
		return new Response("", { status: 200 });
	};
	const config = compileConfig({
		routes: [
			{
				path: "/200",
				pathPattern: /\/200$/,
				strategy: originalStrategy,
				middlewares: [saveDataMiddleware({ saveDataStrategy })],
			},
		],
	});
	const route = config.routes[0];
	const event = { waitUntil: () => {} };

	await fetchStrategy(
		new Request(`${domain}/200`, {
			headers: new Headers({ "Save-Data": "on" }),
		}),
		event,
		route,
	);
	await fetchStrategy(new Request(`${domain}/200`), event, route);

	deepEqual(calls, ["saveData", "original"]);
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
