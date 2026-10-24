/* global Response Headers */
import { bench, suite } from "node:bench";
import "../../../fixtures/helper.js";
import { cacheExpired } from "./cache.js";

suite("@work-bee/core", () => {
	bench(
		"perf: cacheExpired - expired response",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 5_000;
			const pastDate = new Date(Date.now() - 86400 * 1000).toString();
			const response = new Response("", {
				headers: new Headers({ Expires: pastDate }),
			});
			b.start();
			for (let i = 0; i < iterations; i++) {
				cacheExpired(response);
			}
			b.end(iterations);
		},
	);

	bench(
		"perf: cacheExpired - valid response",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 5_000;
			const futureDate = new Date(Date.now() + 86400 * 1000).toString();
			const response = new Response("", {
				headers: new Headers({ Expires: futureDate }),
			});
			b.start();
			for (let i = 0; i < iterations; i++) {
				cacheExpired(response);
			}
			b.end(iterations);
		},
	);

	bench(
		"perf: cacheExpired - falsy response",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 10_000;
			b.start();
			for (let i = 0; i < iterations; i++) {
				cacheExpired(undefined);
			}
			b.end(iterations);
		},
	);
});
