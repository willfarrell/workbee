import { bench, suite } from "node:bench";
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

suite("@work-bee/core", () => {
	bench(
		"perf: findRouteConfig - first route match",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 5_000;
			const request = new Request(`${domain}/api/users`);
			b.start();
			for (let i = 0; i < iterations; i++) {
				findRouteConfig(config, request);
			}
			b.end(iterations);
		},
	);

	bench(
		"perf: findRouteConfig - last route match",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 5_000;
			const request = new Request(`${domain}/fonts/roboto.woff2`);
			b.start();
			for (let i = 0; i < iterations; i++) {
				findRouteConfig(config, request);
			}
			b.end(iterations);
		},
	);

	bench(
		"perf: findRouteConfig - no match (fallback)",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 5_000;
			const request = new Request(`${domain}/unknown/path`);
			b.start();
			for (let i = 0; i < iterations; i++) {
				findRouteConfig(config, request);
			}
			b.end(iterations);
		},
	);

	bench(
		"perf: fetchStrategy - with middleware",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 100;
			const request = new Request(`${domain}/200`);
			const event = { waitUntil: () => {} };
			const strategyConfig = compileConfig({
				strategy: strategyNetworkOnly,
				middlewares: [middleware, middleware],
			});
			b.start();
			for (let i = 0; i < iterations; i++) {
				await fetchStrategy(request, event, strategyConfig);
			}
			b.end(iterations);
		},
	);
});
