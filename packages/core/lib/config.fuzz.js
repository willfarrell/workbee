import { test } from "node:test";
import fc from "fast-check";
import "../../../fixtures/helper.js";
import {
	strategyCacheFirst,
	strategyCacheOnly,
	strategyNetworkFirst,
	strategyNetworkOnly,
	strategyStaleWhileRevalidate,
} from "../index.js";
import { compileConfig, pathPattern } from "./config.js";

const strategies = [
	strategyNetworkOnly,
	strategyNetworkFirst,
	strategyCacheFirst,
	strategyCacheOnly,
	strategyStaleWhileRevalidate,
];

test("fuzz: compileConfig with arbitrary strings", () => {
	fc.assert(
		fc.property(
			fc.string(),
			fc.string(),
			fc.string(),
			(cachePrefix, cacheName, path) => {
				const config = compileConfig({
					cachePrefix,
					cacheName,
					strategy: strategyNetworkOnly,
					routes: [],
				});
				return (
					typeof config.cacheKey === "string" &&
					Array.isArray(config.routes) &&
					Array.isArray(config.before) &&
					Array.isArray(config.after)
				);
			},
		),
		{ numRuns: 1000 },
	);
});

test("fuzz: compileConfig with arbitrary route counts", () => {
	fc.assert(
		fc.property(
			fc.array(
				fc.record({
					cacheName: fc.string(),
					strategy: fc.constantFrom(...strategies),
				}),
				{ maxLength: 50 },
			),
			(routes) => {
				const config = compileConfig({
					strategy: strategyNetworkOnly,
					routes: routes.map((r) => ({
						...r,
						pathPattern: pathPattern(".*$"),
					})),
				});
				return config.routes.length === routes.length;
			},
		),
		{ numRuns: 500 },
	);
});

test("fuzz: compileConfig with arbitrary middleware shapes", () => {
	fc.assert(
		fc.property(
			fc.array(
				fc.record({
					before: fc.option(fc.constant((req) => req)),
					beforeNetwork: fc.option(fc.constant((req) => req)),
					afterNetwork: fc.option(fc.constant((_req, res) => res)),
					after: fc.option(fc.constant((_req, res) => res)),
				}),
				{ maxLength: 20 },
			),
			(middlewares) => {
				const config = compileConfig({
					strategy: strategyNetworkOnly,
					middlewares,
				});
				return (
					Array.isArray(config.before) &&
					Array.isArray(config.after) &&
					Array.isArray(config.beforeNetwork) &&
					Array.isArray(config.afterNetwork)
				);
			},
		),
		{ numRuns: 500 },
	);
});

test("fuzz: compileConfig with precache string routes", () => {
	fc.assert(
		fc.property(fc.array(fc.string(), { maxLength: 30 }), (paths) => {
			const config = compileConfig({
				strategy: strategyNetworkOnly,
				precache: {
					routes: paths,
					strategy: strategyCacheOnly,
				},
			});
			return config.precache.routes.length === paths.length;
		}),
		{ numRuns: 500 },
	);
});
