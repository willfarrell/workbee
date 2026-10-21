/* global Request Response */
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";

import { bench, suite } from "node:bench";
import "../../fixtures/helper.js";
import offlineMiddleware, { idbSerializeRequest } from "./index.js";

suite("@work-bee/offline", () => {
	bench("perf: idbSerializeRequest", { warmup: 5, samples: 30 }, async (b) => {
		const iterations = 100;
		b.start();
		for (let i = 0; i < iterations; i++) {
			await idbSerializeRequest(
				new Request("http://localhost:8080/200", {
					method: "POST",
					headers: new Headers({ "Content-Type": "application/json" }),
					body: JSON.stringify({ key: "value" }),
				}),
			);
		}
		b.end(iterations);
	});

	bench(
		"perf: offlineMiddleware afterNetwork (skip path - GET)",
		{ warmup: 5, samples: 30 },
		async (b) => {
			globalThis.indexedDB = new IDBFactory();
			const { afterNetwork, destroy } = offlineMiddleware({ pollDelay: 0 });
			await new Promise((resolve) => setTimeout(resolve, 50));

			const iterations = 1_000;
			const request = new Request("http://localhost:8080/200", {
				method: "GET",
			});
			const response = new Response("{}", { status: 200 });
			const event = { waitUntil: () => {} };
			const config = {};
			b.start();
			for (let i = 0; i < iterations; i++) {
				await afterNetwork(request, response, event, config);
			}
			b.end(iterations);
			destroy();
		},
	);

	bench(
		"perf: offlineMiddleware afterNetwork (skip path - 200 POST)",
		{ warmup: 5, samples: 30 },
		async (b) => {
			globalThis.indexedDB = new IDBFactory();
			const { afterNetwork, destroy } = offlineMiddleware({ pollDelay: 0 });
			await new Promise((resolve) => setTimeout(resolve, 50));

			const iterations = 1_000;
			const response = new Response("{}", { status: 200 });
			const event = { waitUntil: () => {} };
			const config = {};
			b.start();
			for (let i = 0; i < iterations; i++) {
				await afterNetwork(
					new Request("http://localhost:8080/200", {
						method: "POST",
						body: "data",
					}),
					response,
					event,
					config,
				);
			}
			b.end(iterations);
			destroy();
		},
	);
});
