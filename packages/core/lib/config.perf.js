import { test } from "node:test";
import "../.././../test-unit/helper.js";
import {
	strategyCacheFirst,
	strategyCacheOnly,
	strategyIgnore,
	strategyNetworkFirst,
	strategyNetworkOnly,
	strategyStaleWhileRevalidate,
} from "../index.js";
import { compileConfig, pathPattern } from "./config.js";

test("perf: compileConfig - minimal", async () => {
	const iterations = 10_000;
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		compileConfig({
			strategy: strategyNetworkOnly,
			middlewares: [],
		});
	}
	const duration = performance.now() - start;
	console.log(
		`compileConfig (minimal): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: compileConfig - with routes and middlewares", async () => {
	const iterations = 1_000;
	const middleware = {
		before: (request) => request,
		beforeNetwork: (request) => request,
		afterNetwork: (_request, response) => response,
		after: (_request, response) => response,
	};
	const start = performance.now();
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
	const duration = performance.now() - start;
	console.log(
		`compileConfig (5 routes, 3 precache, 2 middlewares): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});
