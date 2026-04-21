import { deepEqual, equal, strictEqual } from "node:assert";
import test from "node:test";
import "../../../fixtures/helper.js";
import * as publicApi from "../index.js";
import {
	compileRoute,
	pick,
	resolveMiddlewares,
	routeInheritKeys,
} from "./route.js";

test("route", async (t) => {
	await t.test(
		"public API re-exports compileRoute, resolveMiddlewares, routeInheritKeys, pick",
		() => {
			strictEqual(publicApi.compileRoute, compileRoute);
			strictEqual(publicApi.resolveMiddlewares, resolveMiddlewares);
			strictEqual(publicApi.pick, pick);
			deepEqual(publicApi.routeInheritKeys, routeInheritKeys);
		},
	);

	// *** pick *** //
	await t.test("pick: returns only requested keys", () => {
		const input = { a: 1, b: 2, c: 3 };
		deepEqual(pick(input, ["a", "c"]), { a: 1, c: 3 });
	});

	await t.test("pick: skips undefined values", () => {
		const input = { a: 1, b: undefined };
		deepEqual(pick(input, ["a", "b", "c"]), { a: 1 });
	});

	await t.test("pick: handles missing source", () => {
		deepEqual(pick(undefined, ["a"]), {});
	});

	// *** routeInheritKeys *** //
	await t.test(
		"routeInheritKeys: lists the properties inherited from a parent",
		() => {
			deepEqual(routeInheritKeys, [
				"cachePrefix",
				"cacheName",
				"methods",
				"strategy",
				"middlewares",
			]);
		},
	);

	// *** resolveMiddlewares *** //
	await t.test(
		"resolveMiddlewares: derives cacheKey from prefix + name",
		() => {
			const cfg = resolveMiddlewares({
				cachePrefix: "v1-",
				cacheName: "assets",
			});
			equal(cfg.cacheKey, "v1-assets");
		},
	);

	await t.test(
		"resolveMiddlewares: flattens each middleware phase, reversing after-phases",
		() => {
			const m1 = {
				before: () => "b1",
				beforeNetwork: () => "bn1",
				afterNetwork: () => "an1",
				after: () => "a1",
			};
			const m2 = {
				before: () => "b2",
				beforeNetwork: () => "bn2",
				afterNetwork: () => "an2",
				after: () => "a2",
			};
			const cfg = resolveMiddlewares({
				cachePrefix: "",
				cacheName: "x",
				middlewares: [m1, m2],
			});
			deepEqual(
				cfg.before.map((fn) => fn()),
				["b1", "b2"],
			);
			deepEqual(
				cfg.beforeNetwork.map((fn) => fn()),
				["bn1", "bn2"],
			);
			// after-phases reverse so the last registered middleware unwinds first.
			deepEqual(
				cfg.afterNetwork.map((fn) => fn()),
				["an2", "an1"],
			);
			deepEqual(
				cfg.after.map((fn) => fn()),
				["a2", "a1"],
			);
		},
	);

	await t.test(
		"resolveMiddlewares: filters null/undefined middleware entries",
		() => {
			const m1 = { before: () => "b1" };
			const cfg = resolveMiddlewares({
				cachePrefix: "",
				cacheName: "x",
				middlewares: [null, m1, undefined],
			});
			equal(cfg.before.length, 1);
		},
	);

	await t.test(
		"resolveMiddlewares: treats missing phase hooks as no-ops",
		() => {
			const cfg = resolveMiddlewares({
				cachePrefix: "",
				cacheName: "x",
				middlewares: [{ before: () => "b" }],
			});
			equal(cfg.before.length, 1);
			equal(cfg.after.length, 0);
		},
	);

	// *** compileRoute *** //
	await t.test("compileRoute: converts a string to { path }", () => {
		const parent = {
			cachePrefix: "sw-",
			cacheName: "default",
			methods: ["GET"],
			strategy: () => {},
			middlewares: [],
		};
		const route = compileRoute(parent, "/home");
		equal(route.path, "/home");
		equal(route.cacheKey, "sw-default");
	});

	await t.test(
		"compileRoute: inherits only the declared keys from the parent",
		() => {
			const parent = {
				cachePrefix: "sw-",
				cacheName: "default",
				methods: ["GET"],
				strategy: "parent-strategy",
				middlewares: [{ before: () => "parent" }],
				// Non-inherit keys should not leak through:
				pathPattern: /ignored/,
				routes: ["ignored"],
			};
			const route = compileRoute(parent, { path: "/x" });
			equal(route.cachePrefix, "sw-");
			equal(route.cacheName, "default");
			equal(route.strategy, "parent-strategy");
			strictEqual(route.pathPattern, undefined);
			strictEqual(route.routes, undefined);
		},
	);

	await t.test(
		"compileRoute: defaults methods to ['GET'] when parent has empty methods",
		() => {
			const parent = {
				cachePrefix: "sw-",
				cacheName: "default",
				methods: [],
				strategy: () => {},
				middlewares: [],
			};
			const route = compileRoute(parent, { path: "/home" });
			deepEqual(route.methods, ["GET"]);
		},
	);

	await t.test("compileRoute: preserves parent's non-empty methods", () => {
		const parent = {
			cachePrefix: "sw-",
			cacheName: "default",
			methods: ["POST"],
			strategy: () => {},
			middlewares: [],
		};
		const route = compileRoute(parent, { path: "/submit" });
		deepEqual(route.methods, ["POST"]);
	});

	await t.test("compileRoute: raw overrides inherited keys", () => {
		const parent = {
			cachePrefix: "v1-",
			cacheName: "default",
			methods: ["GET"],
			strategy: "parent",
			middlewares: [],
		};
		const route = compileRoute(parent, {
			path: "/api",
			cacheName: "api",
			strategy: "override",
		});
		equal(route.cacheName, "api");
		equal(route.strategy, "override");
		equal(route.cacheKey, "v1-api");
	});
});
