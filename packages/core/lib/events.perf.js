import { test } from "node:test";
import "../../../fixtures/helper.js";
import {
	compileConfig,
	pathPattern,
	strategyCacheFirst,
	strategyCacheOnly,
	strategyNetworkOnly,
} from "../index.js";
import { fetchStrategy, findRouteConfig } from "./events.js";

const domain = "http://localhost:8080";

const middleware = {
	before: (request) => request,
	beforeNetwork: (request) => request,
	afterNetwork: (_request, response) => response,
	after: (_request, response) => response,
};

const config = compileConfig({
	strategy: strategyNetworkOnly,
	middlewares: [middleware],
	routes: [
		{
			methods: ["GET"],
			pathPattern: pathPattern("/api/.*$"),
			strategy: strategyCacheFirst,
			cacheName: "api",
			middlewares: [middleware],
		},
		{
			methods: ["GET"],
			pathPattern: pathPattern("/static/.*$"),
			strategy: strategyCacheOnly,
			cacheName: "static",
			middlewares: [middleware],
		},
		{
			methods: ["POST"],
			pathPattern: pathPattern("/api/.*$"),
			strategy: strategyNetworkOnly,
			cacheName: "api-post",
			middlewares: [middleware],
		},
		{
			methods: ["GET"],
			pathPattern: pathPattern("/images/.*$"),
			strategy: strategyCacheOnly,
			cacheName: "images",
			middlewares: [],
		},
		{
			methods: ["GET"],
			pathPattern: pathPattern("/fonts/.*$"),
			strategy: strategyCacheOnly,
			cacheName: "fonts",
			middlewares: [],
		},
	],
});

test("perf: findRouteConfig - first route match", async () => {
	const iterations = 100_000;
	const request = new Request(`${domain}/api/users`);
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		findRouteConfig(config, request);
	}
	const duration = performance.now() - start;
	console.log(
		`findRouteConfig (first match): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: findRouteConfig - last route match", async () => {
	const iterations = 100_000;
	const request = new Request(`${domain}/fonts/roboto.woff2`);
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		findRouteConfig(config, request);
	}
	const duration = performance.now() - start;
	console.log(
		`findRouteConfig (last match): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: findRouteConfig - no match (fallback)", async () => {
	const iterations = 100_000;
	const request = new Request(`${domain}/unknown/path`);
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		findRouteConfig(config, request);
	}
	const duration = performance.now() - start;
	console.log(
		`findRouteConfig (no match): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: fetchStrategy - with middleware", async () => {
	const iterations = 10_000;
	const request = new Request(`${domain}/200`);
	const event = { waitUntil: () => {} };
	const strategyConfig = compileConfig({
		strategy: strategyNetworkOnly,
		middlewares: [middleware, middleware],
	});
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await fetchStrategy(request, event, strategyConfig);
	}
	const duration = performance.now() - start;
	console.log(
		`fetchStrategy (networkOnly, 2 middlewares): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});
