/// <reference lib="webworker" />

import type { RouteConfig, Strategy, WorkBeeConfig } from "@work-bee/core";
import {
	addHeaderToRequest,
	addHeaderToResponse,
	authorizationHeader,
	cacheDeleteExpired,
	cacheExpired,
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
	getMethod,
	headersGetAll,
	headMethod,
	isRequest,
	isResponse,
	newRequest,
	newResponse,
	openCaches,
	optionsMethod,
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
	strategyStaleWhileRevalidate,
	strategyStatic,
	urlRemoveHash,
} from "@work-bee/core";
import { describe, expect, test } from "tstyche";

describe("types", () => {
	test("Strategy type", () => {
		expect(strategyNetworkOnly).type.toBe(undefined as unknown as Strategy);
	});

	test("strategies are Strategy type", () => {
		expect(strategyNetworkOnly).type.toBeAssignableTo(
			undefined as unknown as Strategy,
		);
		expect(strategyCacheOnly).type.toBeAssignableTo(
			undefined as unknown as Strategy,
		);
		expect(strategyNetworkFirst).type.toBeAssignableTo(
			undefined as unknown as Strategy,
		);
		expect(strategyCacheFirst).type.toBeAssignableTo(
			undefined as unknown as Strategy,
		);
		expect(strategyStaleWhileRevalidate).type.toBeAssignableTo(
			undefined as unknown as Strategy,
		);
		expect(strategyIgnore).type.toBeAssignableTo(
			undefined as unknown as Strategy,
		);
		expect(strategyCacheFirstIgnore).type.toBeAssignableTo(
			undefined as unknown as Strategy,
		);
	});

	test("strategyStatic returns Strategy", () => {
		expect(strategyStatic({} as unknown as Response)).type.toBe(
			undefined as unknown as Strategy,
		);
	});

	test("strategyHTMLPartition returns Strategy", () => {
		expect(strategyHTMLPartition()).type.toBe(undefined as unknown as Strategy);
		expect(strategyHTMLPartition({})).type.toBe(
			undefined as unknown as Strategy,
		);
	});

	test("strategyPartition returns Strategy", () => {
		expect(strategyPartition()).type.toBe(undefined as unknown as Strategy);
	});
});

describe("lib/cache", () => {
	test("openCaches is Record<string, Cache>", () => {
		expect(openCaches).type.toBe(undefined as unknown as Record<string, Cache>);
	});

	test("cacheOverrideEvent returns handler function", () => {
		expect(cacheOverrideEvent({} as unknown as WorkBeeConfig)).type.toBe(
			undefined as unknown as (messageEvent: {
				request: string | Request;
				response: string | Response;
			}) => Promise<void>,
		);
	});

	test("cachePut returns Promise<void>", () => {
		expect(
			cachePut("key", {} as unknown as Request, {} as unknown as Response),
		).type.toBe(undefined as unknown as Promise<void>);
	});

	test("cacheExpired returns boolean | undefined", () => {
		expect(cacheExpired({} as unknown as Response)).type.toBe(
			undefined as unknown as boolean | undefined,
		);
		expect(cacheExpired(undefined)).type.toBe(
			undefined as unknown as boolean | undefined,
		);
	});

	test("cacheDeleteExpired returns Promise<void>", () => {
		expect(cacheDeleteExpired("key")).type.toBe(
			undefined as unknown as Promise<void>,
		);
	});

	test("cachesDeleteExpired returns Promise<undefined[]>", () => {
		expect(cachesDeleteExpired()).type.toBe(
			undefined as unknown as Promise<undefined[]>,
		);
	});

	test("cachesDelete returns Promise<boolean[]>", () => {
		expect(cachesDelete()).type.toBe(
			undefined as unknown as Promise<boolean[]>,
		);
		expect(cachesDelete(["exclude"])).type.toBe(
			undefined as unknown as Promise<boolean[]>,
		);
	});
});

describe("lib/config", () => {
	test("pathPattern returns RegExp", () => {
		expect(pathPattern("/api/*")).type.toBe(undefined as unknown as RegExp);
	});

	test("defaultConfig is WorkBeeConfig", () => {
		expect(defaultConfig).type.toBe(undefined as unknown as WorkBeeConfig);
	});

	test("compileConfig returns WorkBeeConfig", () => {
		expect(compileConfig({})).type.toBe(undefined as unknown as WorkBeeConfig);
	});
});

describe("lib/console", () => {
	test("consoleLog is typeof console.log", () => {
		expect(consoleLog).type.toBe(undefined as unknown as typeof console.log);
	});

	test("consoleError is typeof console.error", () => {
		expect(consoleError).type.toBe(
			undefined as unknown as typeof console.error,
		);
	});
});

describe("lib/events", () => {
	test("eventInstall returns void", () => {
		expect(
			eventInstall(
				{} as unknown as ExtendableEvent,
				{} as unknown as WorkBeeConfig,
			),
		).type.toBe<void>();
	});

	test("eventActivate returns void", () => {
		expect(
			eventActivate(
				{} as unknown as ExtendableEvent,
				{} as unknown as WorkBeeConfig,
			),
		).type.toBe<void>();
	});

	test("eventFetch returns void", () => {
		expect(
			eventFetch({} as unknown as FetchEvent, {} as unknown as WorkBeeConfig),
		).type.toBe<void>();
	});

	test("findRouteConfig returns RouteConfig", () => {
		expect(
			findRouteConfig({} as unknown as WorkBeeConfig, {} as unknown as Request),
		).type.toBe(undefined as unknown as RouteConfig);
	});

	test("fetchInlineStrategy returns Promise<Response>", () => {
		expect(
			fetchInlineStrategy(
				{} as unknown as Request,
				{} as unknown as ExtendableEvent,
				{} as unknown as RouteConfig,
			),
		).type.toBe(undefined as unknown as Promise<Response>);
	});

	test("fetchStrategy returns Promise<Response>", () => {
		expect(
			fetchStrategy(
				{} as unknown as Request,
				{} as unknown as ExtendableEvent,
				{} as unknown as RouteConfig,
			),
		).type.toBe(undefined as unknown as Promise<Response>);
	});
});

describe("lib/http", () => {
	test("headersGetAll returns Record<string, string>", () => {
		expect(headersGetAll(new Headers())).type.toBe(
			undefined as unknown as Record<string, string>,
		);
		expect(headersGetAll(undefined)).type.toBe(
			undefined as unknown as Record<string, string>,
		);
	});

	test("urlRemoveHash returns string", () => {
		expect(urlRemoveHash("http://example.com#hash")).type.toBe(
			undefined as unknown as string,
		);
	});

	test("isRequest is type guard", () => {
		expect(isRequest(undefined as unknown)).type.toBe(
			undefined as unknown as boolean,
		);
	});

	test("newRequest returns Request", () => {
		expect(newRequest("http://example.com")).type.toBe(
			undefined as unknown as Request,
		);
		expect(newRequest({} as unknown as Request, {})).type.toBe(
			undefined as unknown as Request,
		);
	});

	test("addHeaderToRequest returns Request", () => {
		expect(
			addHeaderToRequest({} as unknown as Request, "key", "value"),
		).type.toBe(undefined as unknown as Request);
	});

	test("isResponse is type guard", () => {
		expect(isResponse(undefined as unknown)).type.toBe(
			undefined as unknown as boolean,
		);
	});

	test("newResponse returns Response", () => {
		expect(newResponse({})).type.toBe(undefined as unknown as Response);
		expect(
			newResponse({ status: 200, url: "http://example.com", body: null }),
		).type.toBe(undefined as unknown as Response);
	});

	test("addHeaderToResponse returns Response", () => {
		expect(
			addHeaderToResponse({} as unknown as Response, "key", "value"),
		).type.toBe(undefined as unknown as Response);
	});

	test("deleteHeaderFromResponse returns Response", () => {
		expect(
			deleteHeaderFromResponse({} as unknown as Response, "key"),
		).type.toBe(undefined as unknown as Response);
	});

	test("HTTP method constants", () => {
		expect(getMethod).type.toBe(undefined as unknown as "GET");
		expect(postMethod).type.toBe(undefined as unknown as "POST");
		expect(putMethod).type.toBe(undefined as unknown as "PUT");
		expect(patchMethod).type.toBe(undefined as unknown as "PATCH");
		expect(deleteMethod).type.toBe(undefined as unknown as "DELETE");
		expect(headMethod).type.toBe(undefined as unknown as "HEAD");
		expect(optionsMethod).type.toBe(undefined as unknown as "OPTIONS");
	});

	test("authorizationHeader constant", () => {
		expect(authorizationHeader).type.toBe(
			undefined as unknown as "Authorization",
		);
	});
});

describe("lib/postMessage", () => {
	test("postMessageToAll returns Promise<void>", () => {
		expect(postMessageToAll("msg")).type.toBe(
			undefined as unknown as Promise<void>,
		);
	});

	test("postMessageToFocused returns Promise<void>", () => {
		expect(postMessageToFocused("msg")).type.toBe(
			undefined as unknown as Promise<void>,
		);
	});
});
