/* global Request Response */
import { test } from "node:test";
import "../../test-unit/helper.js";
import { strategyNetworkOnly } from "@work-bee/core";
import loggerMiddleware from "./index.js";

test("perf: loggerMiddleware before + after (noop logger)", async () => {
	const iterations = 100_000;
	const { before, beforeNetwork, afterNetwork, after } = loggerMiddleware({
		logger: () => {},
	});
	const request = new Request("http://localhost:8080/200");
	const response = new Response("{}", { status: 200 });
	const event = {};
	const config = { strategy: strategyNetworkOnly };
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		before(request, event, config);
		beforeNetwork(request, event, config);
		afterNetwork(request, response, event, config);
		after(request, response, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`loggerMiddleware all hooks (noop): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});
