/* global Request */
import { bench, suite } from "node:bench";
import { domain, setupMocks } from "../../../fixtures/helper.js";
import {
	strategyCacheFirst,
	strategyCacheFirstIgnore,
	strategyCacheOnly,
	strategyIgnore,
	strategyNetworkFirst,
	strategyNetworkOnly,
	strategyStaleWhileRevalidate,
	strategyStatic,
} from "./strategies.js";

suite("@work-bee/core", () => {
	bench("perf: strategyIgnore", { warmup: 5, samples: 30 }, async (b) => {
		const iterations = 5_000;
		b.start();
		for (let i = 0; i < iterations; i++) {
			strategyIgnore();
		}
		b.end(iterations);
	});

	bench("perf: strategyStatic", { warmup: 5, samples: 30 }, async (b) => {
		const iterations = 1_000;
		const response = new Response("{}", { status: 200 });
		const strategy = strategyStatic(response);
		b.start();
		for (let i = 0; i < iterations; i++) {
			strategy();
		}
		b.end(iterations);
	});

	bench("perf: strategyCacheOnly", { warmup: 5, samples: 30 }, async (b) => {
		const iterations = 100;
		const request = new Request(`${domain}/cache/found`);
		const event = { waitUntil: () => {} };
		const { config } = setupMocks(strategyCacheOnly);
		b.start();
		for (let i = 0; i < iterations; i++) {
			await strategyCacheOnly(request, event, config);
		}
		b.end(iterations);
	});

	bench("perf: strategyNetworkOnly", { warmup: 5, samples: 30 }, async (b) => {
		const iterations = 100;
		const request = new Request(`${domain}/200`);
		const event = { waitUntil: () => {} };
		const { config } = setupMocks(strategyNetworkOnly);
		b.start();
		for (let i = 0; i < iterations; i++) {
			await strategyNetworkOnly(request, event, config);
		}
		b.end(iterations);
	});

	bench("perf: strategyNetworkFirst", { warmup: 5, samples: 30 }, async (b) => {
		const iterations = 100;
		const request = new Request(`${domain}/200`);
		const event = {
			waitUntil: () => {},
		};
		const { config } = setupMocks(strategyNetworkFirst);
		b.start();
		for (let i = 0; i < iterations; i++) {
			await strategyNetworkFirst(request, event, config);
		}
		b.end(iterations);
	});

	bench(
		"perf: strategyCacheFirst - cache hit",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 100;
			const request = new Request(`${domain}/cache/found`);
			const event = {
				waitUntil: () => {},
			};
			const { config } = setupMocks(strategyCacheFirst);
			b.start();
			for (let i = 0; i < iterations; i++) {
				await strategyCacheFirst(request, event, config);
			}
			b.end(iterations);
		},
	);

	bench(
		"perf: strategyCacheFirst - cache miss",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 100;
			const request = new Request(`${domain}/200`);
			const event = {
				waitUntil: () => {},
			};
			const { config } = setupMocks(strategyCacheFirst, undefined);
			b.start();
			for (let i = 0; i < iterations; i++) {
				await strategyCacheFirst(request, event, config);
			}
			b.end(iterations);
		},
	);

	bench(
		"perf: strategyStaleWhileRevalidate - cache hit",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 100;
			const request = new Request(`${domain}/cache/found`);
			const event = {
				waitUntil: () => {},
			};
			const { config } = setupMocks(strategyStaleWhileRevalidate);
			b.start();
			for (let i = 0; i < iterations; i++) {
				await strategyStaleWhileRevalidate(request, event, config);
			}
			b.end(iterations);
		},
	);

	bench(
		"perf: strategyCacheFirstIgnore - cache hit",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 100;
			const request = new Request(`${domain}/cache/found`);
			const event = { waitUntil: () => {} };
			const { config } = setupMocks(strategyCacheFirstIgnore);
			b.start();
			for (let i = 0; i < iterations; i++) {
				await strategyCacheFirstIgnore(request, event, config);
			}
			b.end(iterations);
		},
	);
});
