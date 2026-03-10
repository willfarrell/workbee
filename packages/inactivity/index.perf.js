/* global Request Response */
import { test } from "node:test";
import "../../fixtures/helper.js";
import inactivityMiddleware from "./index.js";

test("perf: inactivityMiddleware before + after", async () => {
	const iterations = 100_000;
	const { before, after } = inactivityMiddleware({
		inactivityAllowedInMin: 15,
		inactivityEvent: () => {},
	});
	const request = new Request("http://localhost:8080/200");
	const response = new Response("{}", { status: 200 });
	const event = {};
	const config = {};
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		before(request, event, config);
		after(request, response, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`inactivityMiddleware before+after: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});
