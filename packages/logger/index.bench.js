/* global Request Response */
import { bench, suite } from "node:bench";
import "../../fixtures/helper.js";
import { strategyNetworkOnly } from "@work-bee/core";
import loggerMiddleware from "./index.js";

suite("@work-bee/logger", () => {
	bench(
		"perf: loggerMiddleware before + after (noop logger)",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 5_000;
			const { before, beforeNetwork, afterNetwork, after } = loggerMiddleware({
				logger: () => {},
			});
			const request = new Request("http://localhost:8080/200");
			const response = new Response("{}", { status: 200 });
			const event = {};
			const config = { strategy: strategyNetworkOnly };
			b.start();
			for (let i = 0; i < iterations; i++) {
				before(request, event, config);
				beforeNetwork(request, event, config);
				afterNetwork(request, response, event, config);
				after(request, response, event, config);
			}
			b.end(iterations);
		},
	);
});
