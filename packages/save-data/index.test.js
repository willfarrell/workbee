/* global Headers Request */

import { deepEqual } from "node:assert";
import test from "node:test";
import { domain, setupMocks } from "../../fixtures/helper.js";
import { strategyCacheOnly, strategyNetworkFirst } from "../core/index.js";
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
