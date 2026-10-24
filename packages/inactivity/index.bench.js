/* global Request Response */
import { bench, suite } from "node:bench";
import "../../fixtures/helper.js";
import inactivityMiddleware from "./index.js";

suite("@work-bee/inactivity", () => {
	bench(
		"perf: inactivityMiddleware before + after",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 5_000;
			const { before, after } = inactivityMiddleware({
				postMessage: async () => {},
			});
			const request = new Request("http://localhost:8080/200");
			const response = new Response("{}", { status: 200 });
			const event = {};
			const config = {};
			b.start();
			for (let i = 0; i < iterations; i++) {
				before(request, event, config);
				after(request, response, event, config);
			}
			b.end(iterations);
		},
	);
});
