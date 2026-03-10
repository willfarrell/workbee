/* global Request Response Headers */
import { test } from "node:test";
import "../../test-unit/helper.js";
import { strategyNetworkFirst } from "@work-bee/core";
import saveDataMiddleware from "./index.js";

test("perf: saveDataMiddleware before + after", async () => {
	const iterations = 100_000;
	const { before, after } = saveDataMiddleware();
	const request = new Request("http://localhost:8080/200", {
		headers: new Headers({ "Save-Data": "on" }),
	});
	const response = new Response("{}", { status: 200 });
	const event = {};
	const config = { strategy: strategyNetworkFirst };
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		before(request, event, config);
		after(request, response, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`saveDataMiddleware before+after (Save-Data: on): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: saveDataMiddleware before - no Save-Data", async () => {
	const iterations = 100_000;
	const { before, after } = saveDataMiddleware();
	const request = new Request("http://localhost:8080/200");
	const response = new Response("{}", { status: 200 });
	const event = {};
	const config = { strategy: strategyNetworkFirst };
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		before(request, event, config);
		after(request, response, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`saveDataMiddleware before+after (no Save-Data): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});
