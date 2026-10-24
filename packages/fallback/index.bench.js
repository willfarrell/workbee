/* global Request Response */
import { bench, suite } from "node:bench";
import "../../fixtures/helper.js";
import fallbackMiddleware from "./index.js";

suite("@work-bee/fallback", () => {
	bench(
		"perf: fallbackMiddleware after - ok response (passthrough)",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 1_000;
			const { after } = fallbackMiddleware({
				path: "/fallback.html",
				statusCodes: [404, 503],
			});
			const request = new Request("http://localhost:8080/200");
			const response = new Response("{}", { status: 200 });
			const event = { waitUntil: () => {} };
			const config = { cacheKey: "sw-default" };
			b.start();
			for (let i = 0; i < iterations; i++) {
				await after(request, response, event, config);
			}
			b.end(iterations);
		},
	);
});
