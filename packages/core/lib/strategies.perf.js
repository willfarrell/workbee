/* global Request */
import { test } from "node:test";
import { domain, setupMocks } from "../../../test-unit/helper.js";
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

test("perf: strategyIgnore", async () => {
	const iterations = 100_000;
	const request = new Request(`${domain}/200`);
	const event = { waitUntil: () => {} };
	const { config } = setupMocks(strategyIgnore);
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		strategyIgnore(request, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`strategyIgnore: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: strategyStatic", async () => {
	const iterations = 10_000;
	const response = new Response("{}", { status: 200 });
	const strategy = strategyStatic(response);
	const request = new Request(`${domain}/200`);
	const event = { waitUntil: () => {} };
	const { config } = setupMocks(strategy);
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		strategy(request, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`strategyStatic: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: strategyCacheOnly", async () => {
	const iterations = 10_000;
	const request = new Request(`${domain}/cache/found`);
	const event = { waitUntil: () => {} };
	const { config } = setupMocks(strategyCacheOnly);
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await strategyCacheOnly(request, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`strategyCacheOnly: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: strategyNetworkOnly", async () => {
	const iterations = 10_000;
	const request = new Request(`${domain}/200`);
	const event = { waitUntil: () => {} };
	const { config } = setupMocks(strategyNetworkOnly);
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await strategyNetworkOnly(request, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`strategyNetworkOnly: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: strategyNetworkFirst", async () => {
	const iterations = 10_000;
	const request = new Request(`${domain}/200`);
	const event = {
		waitUntil: () => {},
	};
	const { config } = setupMocks(strategyNetworkFirst);
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await strategyNetworkFirst(request, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`strategyNetworkFirst: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: strategyCacheFirst - cache hit", async () => {
	const iterations = 10_000;
	const request = new Request(`${domain}/cache/found`);
	const event = {
		waitUntil: () => {},
	};
	const { config } = setupMocks(strategyCacheFirst);
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await strategyCacheFirst(request, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`strategyCacheFirst (cache hit): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: strategyCacheFirst - cache miss", async () => {
	const iterations = 10_000;
	const request = new Request(`${domain}/200`);
	const event = {
		waitUntil: () => {},
	};
	const { config } = setupMocks(strategyCacheFirst, undefined);
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await strategyCacheFirst(request, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`strategyCacheFirst (cache miss): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: strategyStaleWhileRevalidate - cache hit", async () => {
	const iterations = 10_000;
	const request = new Request(`${domain}/cache/found`);
	const event = {
		waitUntil: () => {},
	};
	const { config } = setupMocks(strategyStaleWhileRevalidate);
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await strategyStaleWhileRevalidate(request, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`strategyStaleWhileRevalidate (cache hit): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: strategyCacheFirstIgnore - cache hit", async () => {
	const iterations = 10_000;
	const request = new Request(`${domain}/cache/found`);
	const event = { waitUntil: () => {} };
	const { config } = setupMocks(strategyCacheFirstIgnore);
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await strategyCacheFirstIgnore(request, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`strategyCacheFirstIgnore (cache hit): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});
