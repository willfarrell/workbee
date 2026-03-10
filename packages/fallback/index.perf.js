/* global Request Response */
import { test } from "node:test";
import "../../fixtures/helper.js";
import fallbackMiddleware from "./index.js";

test("perf: fallbackMiddleware after - ok response (passthrough)", async () => {
	const iterations = 100_000;
	const { after } = fallbackMiddleware({
		path: "/fallback.html",
		statusCodes: [404, 503],
	});
	const request = new Request("http://localhost:8080/200");
	const response = new Response("{}", { status: 200 });
	const event = { waitUntil: () => {} };
	const config = { cacheKey: "sw-default" };
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await after(request, response, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`fallbackMiddleware after (ok passthrough): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});
