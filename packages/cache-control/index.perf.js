/* global Request Response Headers */
import { test } from "node:test";
import "../../fixtures/helper.js";
import cacheControlMiddleware from "./index.js";

test("perf: cacheControlMiddleware afterNetwork", async () => {
	const iterations = 100_000;
	const { afterNetwork } = cacheControlMiddleware({
		cacheControl: "max-age=3600",
	});
	const request = new Request("http://localhost:8080/200");
	const response = new Response("{}", {
		status: 200,
		headers: new Headers({
			"Content-Type": "application/json",
			"Cache-Control": "max-age=86400",
		}),
	});
	const event = {};
	const config = {};
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		afterNetwork(request, response, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`cacheControlMiddleware afterNetwork: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});
