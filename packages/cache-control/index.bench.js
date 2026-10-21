/* global Request Response Headers */
import { bench, suite } from "node:bench";
import "../../fixtures/helper.js";
import cacheControlMiddleware from "./index.js";

suite("@work-bee/cache-control", () => {
	bench(
		"perf: cacheControlMiddleware afterNetwork",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 5_000;
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
			b.start();
			for (let i = 0; i < iterations; i++) {
				afterNetwork(request, response, event, config);
			}
			b.end(iterations);
		},
	);
});
