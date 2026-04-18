/* global Response Headers */

import { deepEqual, equal, strictEqual } from "node:assert";
import test from "node:test";
import "../../../fixtures/helper.js";
import {
	compileConfig,
	defaultConfig,
	pathPattern,
	strategyNetworkFirst,
	strategyNetworkOnly,
} from "../index.js";

test("config", async (t) => {
	// *** pathPattern *** //
	await t.test("pathPattern: should create a RegExp from string", () => {
		const pattern = pathPattern(".*\\.js$");
		strictEqual(pattern instanceof RegExp, true);
		strictEqual(pattern.test("app.js"), true);
		strictEqual(pattern.test("app.css"), false);
	});

	await t.test("pathPattern: should match partial paths", () => {
		const pattern = pathPattern("/api/.*$");
		strictEqual(pattern.test("/api/users"), true);
		strictEqual(pattern.test("/api/users/123"), true);
		strictEqual(pattern.test("/other"), false);
	});

	// *** defaultConfig *** //
	await t.test("defaultConfig: should have correct defaults", () => {
		equal(defaultConfig.cachePrefix, "sw-");
		equal(defaultConfig.cacheName, "default");
		equal(defaultConfig.cacheControlMaxAge, -1);
		deepEqual(defaultConfig.methods, []);
		deepEqual(defaultConfig.routes, []);
		strictEqual(defaultConfig.strategy, strategyNetworkOnly);
	});

	await t.test("defaultConfig: precache should have correct defaults", () => {
		deepEqual(defaultConfig.precache.routes, []);
		strictEqual(defaultConfig.precache.eventType, false);
		strictEqual(defaultConfig.precache.strategy, strategyNetworkFirst);
	});

	await t.test("defaultConfig: activate should have correct defaults", () => {
		strictEqual(defaultConfig.activate.eventType, false);
	});

	// *** compileConfig *** //
	await t.test("compileConfig: should merge with defaultConfig", () => {
		const config = compileConfig({
			middlewares: [],
		});
		equal(config.cachePrefix, "sw-");
		equal(config.cacheName, "default");
		equal(config.cacheKey, "sw-default");
	});

	await t.test("compileConfig: should compute cacheKey", () => {
		const config = compileConfig({
			cachePrefix: "app-",
			cacheName: "api",
			middlewares: [],
		});
		equal(config.cacheKey, "app-api");
	});

	await t.test(
		"compileConfig: should flatten middleware for base config",
		() => {
			const middleware = {
				before: () => {},
				beforeNetwork: () => {},
				afterNetwork: () => {},
				after: () => {},
			};
			const config = compileConfig({
				middlewares: [middleware],
			});
			equal(config.before.length, 1);
			equal(config.beforeNetwork.length, 1);
			equal(config.afterNetwork.length, 1);
			equal(config.after.length, 1);
			strictEqual(config.before[0], middleware.before);
			strictEqual(config.afterNetwork[0], middleware.afterNetwork);
			strictEqual(config.after[0], middleware.after);
		},
	);

	await t.test(
		"compileConfig: should reverse afterNetwork and after arrays",
		() => {
			const middleware1 = {
				afterNetwork: () => "m1",
				after: () => "m1",
			};
			const middleware2 = {
				afterNetwork: () => "m2",
				after: () => "m2",
			};
			const config = compileConfig({
				middlewares: [middleware1, middleware2],
			});
			strictEqual(config.afterNetwork[0], middleware2.afterNetwork);
			strictEqual(config.afterNetwork[1], middleware1.afterNetwork);
			strictEqual(config.after[0], middleware2.after);
			strictEqual(config.after[1], middleware1.after);
		},
	);

	await t.test(
		"compileConfig: should filter out undefined middleware hooks",
		() => {
			const middleware = {
				before: () => {},
				// no beforeNetwork, afterNetwork, after
			};
			const config = compileConfig({
				middlewares: [middleware],
			});
			equal(config.before.length, 1);
			equal(config.beforeNetwork.length, 0);
			equal(config.afterNetwork.length, 0);
			equal(config.after.length, 0);
		},
	);

	// *** compileConfig: routes *** //
	await t.test("compileConfig: should compile route configs", () => {
		const config = compileConfig({
			middlewares: [],
			routes: [
				{
					methods: ["GET"],
					pathPattern: pathPattern("/api/.*$"),
					cacheName: "api",
				},
			],
		});
		equal(config.routes.length, 1);
		equal(config.routes[0].cacheName, "api");
		equal(config.routes[0].cacheKey, "sw-api");
	});

	await t.test(
		"compileConfig: routes should inherit base config values",
		() => {
			const middleware = {
				before: () => {},
			};
			const config = compileConfig({
				cachePrefix: "app-",
				middlewares: [middleware],
				routes: [
					{
						methods: ["GET"],
						pathPattern: pathPattern("/api/.*$"),
					},
				],
			});
			equal(config.routes[0].cachePrefix, "app-");
			equal(config.routes[0].cacheKey, "app-default");
			equal(config.routes[0].before.length, 1);
		},
	);

	await t.test("compileConfig: routes can override base values", () => {
		const config = compileConfig({
			cachePrefix: "sw-",
			cacheName: "default",
			middlewares: [],
			routes: [
				{
					cacheName: "api",
					strategy: strategyNetworkFirst,
				},
			],
		});
		equal(config.routes[0].cacheName, "api");
		equal(config.routes[0].cacheKey, "sw-api");
		strictEqual(config.routes[0].strategy, strategyNetworkFirst);
	});

	// *** compileConfig: precache *** //
	await t.test("compileConfig: should compile precache config", () => {
		const config = compileConfig({
			middlewares: [],
			precache: {
				routes: [{ path: "/index.html" }],
				eventType: false,
			},
		});
		equal(config.precache.routes.length, 1);
		equal(config.precache.routes[0].path, "/index.html");
		equal(config.precache.routes[0].cacheKey, "sw-default");
	});

	await t.test("compileConfig: precache should handle string routes", () => {
		const config = compileConfig({
			middlewares: [],
			precache: {
				routes: ["/index.html", "/style.css"],
				eventType: false,
			},
		});
		equal(config.precache.routes.length, 2);
		equal(config.precache.routes[0].path, "/index.html");
		equal(config.precache.routes[1].path, "/style.css");
	});

	await t.test(
		"compileConfig: precache routes should inherit precache config",
		() => {
			const middleware = {
				before: () => {},
			};
			const config = compileConfig({
				middlewares: [middleware],
				precache: {
					routes: [{ path: "/index.html" }],
					eventType: false,
				},
			});
			equal(config.precache.routes[0].before.length, 1);
		},
	);

	await t.test("compileConfig: precache should compute cacheKey", () => {
		const config = compileConfig({
			cachePrefix: "app-",
			middlewares: [],
			precache: {
				cacheName: "static",
				routes: [],
				eventType: false,
			},
		});
		equal(config.precache.cacheKey, "app-static");
	});

	// *** compileConfig: multiple middlewares *** //
	await t.test("compileConfig: should handle multiple middlewares", () => {
		const m1 = { before: () => "m1" };
		const m2 = { before: () => "m2" };
		const config = compileConfig({
			middlewares: [m1, m2],
		});
		equal(config.before.length, 2);
		strictEqual(config.before[0], m1.before);
		strictEqual(config.before[1], m2.before);
	});

	await t.test("compileConfig: should handle empty middlewares array", () => {
		const config = compileConfig({
			middlewares: [],
		});
		equal(config.before.length, 0);
		equal(config.beforeNetwork.length, 0);
		equal(config.afterNetwork.length, 0);
		equal(config.after.length, 0);
	});

	// *** compileConfig: custom cachePrefix propagation *** //
	await t.test("compileConfig: should handle missing middlewares key", () => {
		const config = compileConfig({});
		equal(config.before.length, 0);
		equal(config.beforeNetwork.length, 0);
		equal(config.afterNetwork.length, 0);
		equal(config.after.length, 0);
	});

	await t.test(
		"compileConfig: should handle null/undefined entries in middlewares array",
		() => {
			const middleware = { before: () => {} };
			const config = compileConfig({
				middlewares: [null, middleware, undefined],
			});
			equal(config.before.length, 1);
		},
	);

	await t.test("compileConfig: custom config should override defaults", () => {
		const config = compileConfig({
			cachePrefix: "custom-",
			cacheName: "data",
			strategy: strategyNetworkFirst,
			middlewares: [],
		});
		equal(config.cachePrefix, "custom-");
		equal(config.cacheName, "data");
		equal(config.cacheKey, "custom-data");
		strictEqual(config.strategy, strategyNetworkFirst);
	});
});
