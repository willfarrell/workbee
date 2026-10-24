/// <reference lib="webworker" />

import type {
	RouteConfig,
	Strategy,
	UserConfig,
	WorkBeeConfig,
} from "@work-bee/core";
import {
	addHeaderToRequest,
	addHeaderToResponse,
	authorizationHeader,
	backgroundFetchSuccessEvent,
	cacheDeleteExpired,
	cacheExpired,
	cacheMatch,
	cacheOverrideEvent,
	cachePut,
	cachesDelete,
	cachesDeleteExpired,
	compileConfig,
	consoleError,
	consoleLog,
	defaultConfig,
	deleteHeaderFromResponse,
	deleteMethod,
	eventActivate,
	eventFetch,
	eventInstall,
	fetchInlineStrategy,
	fetchStrategy,
	findRouteConfig,
	headersGetAll,
	isRequest,
	isResponse,
	newRequest,
	newResponse,
	patchMethod,
	pathPattern,
	postMessageToAll,
	postMessageToFocused,
	postMethod,
	putMethod,
	strategyCacheFirst,
	strategyCacheFirstIgnore,
	strategyCacheOnly,
	strategyHTMLPartition,
	strategyIgnore,
	strategyNetworkFirst,
	strategyNetworkOnly,
	strategyPartition,
	strategyPrecache,
	strategyStaleIfError,
	strategyStaleWhileRevalidate,
	strategyStatic,
	urlRemoveHash,
} from "@work-bee/core";
import { describe, expect, test } from "tstyche";

describe("types", () => {
	test("Strategy type", () => {
		expect(strategyNetworkOnly).type.toBe<Strategy>();
	});

	test("strategies are Strategy type", () => {
		expect(strategyNetworkOnly).type.toBeAssignableTo<Strategy>();
		expect(strategyCacheOnly).type.toBeAssignableTo<Strategy>();
		expect(strategyNetworkFirst).type.toBeAssignableTo<Strategy>();
		expect(strategyCacheFirst).type.toBeAssignableTo<Strategy>();
		expect(strategyStaleWhileRevalidate).type.toBeAssignableTo<Strategy>();
		expect(strategyStaleIfError).type.toBeAssignableTo<Strategy>();
		expect(strategyIgnore).type.toBeAssignableTo<Strategy>();
		expect(strategyCacheFirstIgnore).type.toBeAssignableTo<Strategy>();
		expect(strategyPrecache).type.toBeAssignableTo<Strategy>();
	});

	test("strategyStatic returns Strategy", () => {
		expect(strategyStatic({} as Response)).type.toBe<Strategy>();
	});

	test("strategyHTMLPartition returns Strategy", () => {
		expect(strategyHTMLPartition()).type.toBe<Strategy>();
		expect(strategyHTMLPartition({ routes: [] })).type.toBe<Strategy>();
	});

	test("strategyPartition returns Strategy", () => {
		expect(strategyPartition({ routes: [] })).type.toBe<Strategy>();
		expect(
			strategyPartition({
				routes: [],
				headers: { "Content-Type": "text/html" },
			}),
		).type.toBe<Strategy>();
	});

	test("strategyHTMLPartition accepts the compileConfig({ routes: [{ path }] }) pattern", () => {
		expect(
			strategyHTMLPartition(
				compileConfig({
					routes: [{ path: "$1.header.html" }, { path: "$1.main.html" }],
					strategy: strategyNetworkFirst,
				}),
			),
		).type.toBe<Strategy>();
	});

	test("middleware hooks may be false (disabled)", () => {
		expect(compileConfig).type.toBeCallableWith({
			middlewares: [{ before: false, after: false }],
		});
	});
});

describe("lib/cache", () => {
	test("cacheMatch resolves Response | undefined", () => {
		expect(cacheMatch("key", {} as Request)).type.toBe<
			Promise<Response | undefined>
		>();
	});

	test("cacheOverrideEvent handler accepts a real ExtendableMessageEvent", () => {
		const handler = cacheOverrideEvent({} as WorkBeeConfig, {
			allowedOrigins: ["x"],
		});
		expect(handler).type.toBeCallableWith({} as ExtendableMessageEvent);
		expect(handler({} as ExtendableMessageEvent)).type.toBe<
			Promise<void> | undefined
		>();
	});

	test("cachePut returns Promise<void>", () => {
		expect(cachePut("key", {} as Request, {} as Response)).type.toBe<
			Promise<void>
		>();
	});

	test("cacheExpired returns boolean | undefined", () => {
		expect(cacheExpired({} as Response)).type.toBe<boolean | undefined>();
		expect(cacheExpired(undefined)).type.toBe<boolean | undefined>();
	});

	test("cacheDeleteExpired returns Promise<void>", () => {
		expect(cacheDeleteExpired("key")).type.toBe<Promise<void>>();
	});

	test("cachesDeleteExpired returns Promise<PromiseSettledResult<void>[]>", () => {
		expect(cachesDeleteExpired()).type.toBe<
			Promise<PromiseSettledResult<void>[]>
		>();
	});

	test("cachesDelete returns Promise<boolean[]>", () => {
		expect(cachesDelete()).type.toBe<Promise<boolean[]>>();
		expect(cachesDelete(["exclude"])).type.toBe<Promise<boolean[]>>();
		expect(cachesDelete(["exclude"], ["sw-"])).type.toBe<Promise<boolean[]>>();
	});
});

describe("lib/config", () => {
	test("pathPattern returns RegExp", () => {
		expect(pathPattern("/api/*")).type.toBe<RegExp>();
	});

	test("defaultConfig is a readonly UserConfig", () => {
		expect(defaultConfig).type.toBeAssignableTo<UserConfig>();
		expect(defaultConfig).type.not.toHaveProperty("cacheKey");
	});

	test("activate config is partial and accepts purgePrefixes", () => {
		expect(compileConfig).type.toBeCallableWith({
			activate: { eventType: "activated", purgePrefixes: ["sw-"] },
		});
	});

	test("compileConfig returns WorkBeeConfig", () => {
		expect(compileConfig({})).type.toBe<WorkBeeConfig>();
	});

	test("compileRoute returns RouteConfig", async () => {
		const { compileRoute } = await import("@work-bee/core");
		expect(
			compileRoute({} as RouteConfig, { path: "/x" }),
		).type.toBe<RouteConfig>();
		expect(compileRoute({} as RouteConfig, "/x")).type.toBe<RouteConfig>();
	});

	test("compileConfig accepts a user-facing partial config", () => {
		expect(
			compileConfig({
				cachePrefix: "v1-",
				cacheName: "assets",
				skipWaiting: false,
				middlewares: [],
				routes: [
					{
						cacheName: "api",
						pathPattern: /^\/api/,
						methods: ["GET"],
					},
				],
				precache: {
					routes: ["/offline.html", { path: "/styles.css" }],
					eventType: "precache",
				},
			}),
		).type.toBe<WorkBeeConfig>();
	});

	test("compileConfig rejects internal-only fields", () => {
		expect(compileConfig).type.not.toBeCallableWith({
			cacheKey: "computed-internally",
		});
		expect(compileConfig).type.not.toBeCallableWith({
			before: [],
		});
	});
});

describe("lib/console", () => {
	test("consoleLog is typeof console.log", () => {
		expect(consoleLog).type.toBe(console.log);
	});

	test("consoleError is typeof console.error", () => {
		expect(consoleError).type.toBe(console.error);
	});
});

describe("lib/events", () => {
	test("eventInstall returns void", () => {
		expect(
			eventInstall({} as ExtendableEvent, {} as WorkBeeConfig),
		).type.toBe<void>();
	});

	test("eventActivate returns void", () => {
		expect(
			eventActivate({} as ExtendableEvent, {} as WorkBeeConfig),
		).type.toBe<void>();
	});

	test("eventFetch returns void", () => {
		expect(eventFetch({} as FetchEvent, {} as WorkBeeConfig)).type.toBe<void>();
	});

	test("findRouteConfig returns RouteConfig", () => {
		expect(
			findRouteConfig({} as WorkBeeConfig, {} as Request),
		).type.toBe<RouteConfig>();
	});

	test("fetchInlineStrategy returns Promise<Response | Error>", () => {
		expect(
			fetchInlineStrategy(
				{} as Request,
				{} as ExtendableEvent,
				{} as RouteConfig,
			),
		).type.toBe<Promise<Response | Error>>();
	});

	test("backgroundFetchSuccessEvent needs the config to route records", () => {
		expect(backgroundFetchSuccessEvent).type.toBeCallableWith(
			{} as Event,
			{} as WorkBeeConfig,
		);
		expect(backgroundFetchSuccessEvent).type.not.toBeCallableWith({} as Event);
	});

	test("fetchStrategy returns Promise<Response | Error>", () => {
		expect(
			fetchStrategy({} as Request, {} as ExtendableEvent, {} as RouteConfig),
		).type.toBe<Promise<Response | Error>>();
	});
});

describe("lib/http", () => {
	test("headersGetAll returns Record<string, string>", () => {
		expect(headersGetAll(new Headers())).type.toBe<Record<string, string>>();
		expect(headersGetAll(undefined)).type.toBe<Record<string, string>>();
	});

	test("urlRemoveHash returns string", () => {
		expect(urlRemoveHash("http://example.com#hash")).type.toBe<string>();
	});

	test("isRequest is type guard", () => {
		const maybeRequest = {};

		if (isRequest(maybeRequest)) {
			expect(maybeRequest).type.toBe<Request>();
		}
	});

	test("newRequest returns Request", () => {
		expect(newRequest("http://example.com")).type.toBe<Request>();
		expect(newRequest({} as Request, {})).type.toBe<Request>();
	});

	test("addHeaderToRequest returns Request", () => {
		expect(addHeaderToRequest({} as Request, "key", "value")).type.toBe(
			undefined as unknown as Request,
		);
	});

	test("isResponse is type guard", () => {
		const maybeResponse = {};

		if (isResponse(maybeResponse)) {
			expect(maybeResponse).type.toBe<Response>();
		}
	});

	test("newResponse returns Response", () => {
		expect(newResponse({})).type.toBe<Response>();
		expect(newResponse({ status: 200, body: null })).type.toBe<Response>();
		expect(
			newResponse({}, [["Content-Type", "text/html"]]),
		).type.toBe<Response>();
	});

	test("addHeaderToResponse returns Response", () => {
		expect(
			addHeaderToResponse({} as Response, "key", "value"),
		).type.toBe<Response>();
	});

	test("deleteHeaderFromResponse returns Response", () => {
		expect(
			deleteHeaderFromResponse({} as Response, "key"),
		).type.toBe<Response>();
	});

	test("HTTP method constants", () => {
		expect(postMethod).type.toBe<"POST">();
		expect(putMethod).type.toBe<"PUT">();
		expect(patchMethod).type.toBe<"PATCH">();
		expect(deleteMethod).type.toBe<"DELETE">();
	});

	test("authorizationHeader constant", () => {
		expect(authorizationHeader).type.toBe<"Authorization">();
	});
});

describe("lib/postMessage", () => {
	test("postMessageToAll returns Promise<void>", () => {
		expect(postMessageToAll("msg")).type.toBe<Promise<void>>();
	});

	test("postMessageToFocused returns Promise<void>", () => {
		expect(postMessageToFocused("msg")).type.toBe<Promise<void>>();
	});
});
