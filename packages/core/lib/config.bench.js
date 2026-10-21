import { bench, suite } from "node:bench";
import "../../../fixtures/helper.js";
import {
	strategyCacheFirst,
	strategyCacheOnly,
	strategyIgnore,
	strategyNetworkFirst,
	strategyNetworkOnly,
	strategyStaleWhileRevalidate,
} from "../index.js";
import { compileConfig, pathPattern } from "./config.js";

suite("@work-bee/core", () => {
	bench(
		"perf: compileConfig - minimal",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 1_000;
			b.start();
			for (let i = 0; i < iterations; i++) {
				compileConfig({
					strategy: strategyNetworkOnly,
					middlewares: [],
				});
			}
			b.end(iterations);
		},
	);

	bench(
		"perf: compileConfig - with routes and middlewares",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 100;
			const middleware = {
				before: (request) => request,
				beforeNetwork: (request) => request,
				afterNetwork: (_request, response) => response,
				after: (_request, response) => response,
			};
			b.start();
			for (let i = 0; i < iterations; i++) {
				compileConfig({
					strategy: strategyNetworkFirst,
					middlewares: [middleware, middleware],
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
							strategy: strategyStaleWhileRevalidate,
							cacheName: "static",
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
							methods: ["POST"],
							pathPattern: pathPattern("/api/.*$"),
							strategy: strategyNetworkOnly,
							cacheName: "api-post",
							middlewares: [middleware],
						},
						{
							methods: ["GET"],
							pathPattern: pathPattern("/analytics/.*$"),
							strategy: strategyIgnore,
							cacheName: "analytics",
							middlewares: [],
						},
					],
					precache: {
						routes: [
							{ path: "/index.html" },
							{ path: "/styles.css" },
							{ path: "/app.js" },
						],
						strategy: strategyNetworkFirst,
					},
				});
			}
			b.end(iterations);
		},
	);
});
