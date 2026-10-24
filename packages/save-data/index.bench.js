/* global Request Headers */
import { bench, suite } from "node:bench";
import "../../fixtures/helper.js";
import { strategyNetworkFirst } from "@work-bee/core";
import saveDataMiddleware from "./index.js";

suite("@work-bee/save-data", () => {
	bench(
		"perf: saveDataMiddleware before",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 5_000;
			const { before } = saveDataMiddleware();
			const request = new Request("http://localhost:8080/200", {
				headers: new Headers({ "Save-Data": "on" }),
			});
			const event = {};
			const config = { strategy: strategyNetworkFirst };
			b.start();
			for (let i = 0; i < iterations; i++) {
				before(request, event, { ...config });
			}
			b.end(iterations);
		},
	);

	bench(
		"perf: saveDataMiddleware before - no Save-Data",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 5_000;
			const { before } = saveDataMiddleware();
			const request = new Request("http://localhost:8080/200");
			const event = {};
			const config = { strategy: strategyNetworkFirst };
			b.start();
			for (let i = 0; i < iterations; i++) {
				before(request, event, { ...config });
			}
			b.end(iterations);
		},
	);
});
