// Copyright (c) willfarrell. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

/// <reference lib="webworker" />

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

/** @typedef {import("@work-bee/core").Strategy} Strategy */
/** @typedef {import("@work-bee/core").BeforeMiddleware} BeforeMiddleware */
/** @typedef {import("@work-bee/core").AfterMiddleware} AfterMiddleware */
/** @typedef {import("@work-bee/core").Middleware} Middleware */
/** @typedef {import("@work-bee/core").RouteConfig} RouteConfig */
/** @typedef {import("@work-bee/core").WorkBeeConfig} WorkBeeConfig */
/** @typedef {import("@work-bee/core").PartitionOptions} PartitionOptions */

describe("types", () => {
	test("Strategy type", () => {
		expect(strategyNetworkOnly).type.toBe(
			/** @type {Strategy} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("strategies are Strategy type", () => {
		expect(strategyNetworkOnly).type.toBeAssignableTo(
			/** @type {Strategy} */ (/** @type {unknown} */ (undefined)),
		);
		expect(strategyCacheOnly).type.toBeAssignableTo(
			/** @type {Strategy} */ (/** @type {unknown} */ (undefined)),
		);
		expect(strategyNetworkFirst).type.toBeAssignableTo(
			/** @type {Strategy} */ (/** @type {unknown} */ (undefined)),
		);
		expect(strategyCacheFirst).type.toBeAssignableTo(
			/** @type {Strategy} */ (/** @type {unknown} */ (undefined)),
		);
		expect(strategyStaleWhileRevalidate).type.toBeAssignableTo(
			/** @type {Strategy} */ (/** @type {unknown} */ (undefined)),
		);
		expect(strategyIgnore).type.toBeAssignableTo(
			/** @type {Strategy} */ (/** @type {unknown} */ (undefined)),
		);
		expect(strategyCacheFirstIgnore).type.toBeAssignableTo(
			/** @type {Strategy} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("strategyStatic returns Strategy", () => {
		expect(
			strategyStatic(/** @type {Response} */ (/** @type {unknown} */ ({}))),
		).type.toBe(/** @type {Strategy} */ (/** @type {unknown} */ (undefined)));
	});

	test("strategyHTMLPartition returns Strategy", () => {
		expect(strategyHTMLPartition()).type.toBe(
			/** @type {Strategy} */ (/** @type {unknown} */ (undefined)),
		);
		expect(strategyHTMLPartition({})).type.toBe(
			/** @type {Strategy} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("strategyPartition returns Strategy", () => {
		expect(strategyPartition()).type.toBe(
			/** @type {Strategy} */ (/** @type {unknown} */ (undefined)),
		);
	});
});

describe("lib/cache", () => {
	test("openCaches is Record<string, Cache>", () => {
		expect(openCaches).type.toBe(
			/** @type {Record<string, Cache>} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("cacheOverrideEvent returns handler function", () => {
		expect(
			cacheOverrideEvent(
				/** @type {WorkBeeConfig} */ (/** @type {unknown} */ ({})),
			),
		).type.toBe(
			/** @type {(messageEvent: { request: string | Request; response: string | Response }) => Promise<void>} */ (
				/** @type {unknown} */ (undefined)
			),
		);
	});

	test("cachePut returns Promise<void>", () => {
		expect(
			cachePut(
				"key",
				/** @type {Request} */ (/** @type {unknown} */ ({})),
				/** @type {Response} */ (/** @type {unknown} */ ({})),
			),
		).type.toBe(
			/** @type {Promise<void>} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("cacheExpired returns boolean | undefined", () => {
		expect(
			cacheExpired(/** @type {Response} */ (/** @type {unknown} */ ({}))),
		).type.toBe(
			/** @type {boolean | undefined} */ (/** @type {unknown} */ (undefined)),
		);
		expect(cacheExpired(undefined)).type.toBe(
			/** @type {boolean | undefined} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("cacheDeleteExpired returns Promise<void>", () => {
		expect(cacheDeleteExpired("key")).type.toBe(
			/** @type {Promise<void>} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("cachesDeleteExpired returns Promise<undefined[]>", () => {
		expect(cachesDeleteExpired()).type.toBe(
			/** @type {Promise<undefined[]>} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("cachesDelete returns Promise<boolean[]>", () => {
		expect(cachesDelete()).type.toBe(
			/** @type {Promise<boolean[]>} */ (/** @type {unknown} */ (undefined)),
		);
		expect(cachesDelete(["exclude"])).type.toBe(
			/** @type {Promise<boolean[]>} */ (/** @type {unknown} */ (undefined)),
		);
	});
});

describe("lib/config", () => {
	test("pathPattern returns RegExp", () => {
		expect(pathPattern("/api/*")).type.toBe(
			/** @type {RegExp} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("defaultConfig is WorkBeeConfig", () => {
		expect(defaultConfig).type.toBe(
			/** @type {WorkBeeConfig} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("compileConfig returns WorkBeeConfig", () => {
		expect(compileConfig({})).type.toBe(
			/** @type {WorkBeeConfig} */ (/** @type {unknown} */ (undefined)),
		);
	});
});

describe("lib/console", () => {
	test("consoleLog is typeof console.log", () => {
		expect(consoleLog).type.toBe(
			/** @type {typeof console.log} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("consoleError is typeof console.error", () => {
		expect(consoleError).type.toBe(
			/** @type {typeof console.error} */ (/** @type {unknown} */ (undefined)),
		);
	});
});

describe("lib/events", () => {
	test("eventInstall returns void", () => {
		expect(
			eventInstall(
				/** @type {ExtendableEvent} */ (/** @type {unknown} */ ({})),
				/** @type {WorkBeeConfig} */ (/** @type {unknown} */ ({})),
			),
		).type.toBe(/** @type {void} */ (/** @type {unknown} */ (undefined)));
	});

	test("eventActivate returns void", () => {
		expect(
			eventActivate(
				/** @type {ExtendableEvent} */ (/** @type {unknown} */ ({})),
				/** @type {WorkBeeConfig} */ (/** @type {unknown} */ ({})),
			),
		).type.toBe(/** @type {void} */ (/** @type {unknown} */ (undefined)));
	});

	test("eventFetch returns void", () => {
		expect(
			eventFetch(
				/** @type {FetchEvent} */ (/** @type {unknown} */ ({})),
				/** @type {WorkBeeConfig} */ (/** @type {unknown} */ ({})),
			),
		).type.toBe(/** @type {void} */ (/** @type {unknown} */ (undefined)));
	});

	test("findRouteConfig returns RouteConfig", () => {
		expect(
			findRouteConfig(
				/** @type {WorkBeeConfig} */ (/** @type {unknown} */ ({})),
				/** @type {Request} */ (/** @type {unknown} */ ({})),
			),
		).type.toBe(
			/** @type {RouteConfig} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("fetchInlineStrategy returns Promise<Response>", () => {
		expect(
			fetchInlineStrategy(
				/** @type {Request} */ (/** @type {unknown} */ ({})),
				/** @type {ExtendableEvent} */ (/** @type {unknown} */ ({})),
				/** @type {RouteConfig} */ (/** @type {unknown} */ ({})),
			),
		).type.toBe(
			/** @type {Promise<Response>} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("fetchStrategy returns Promise<Response>", () => {
		expect(
			fetchStrategy(
				/** @type {Request} */ (/** @type {unknown} */ ({})),
				/** @type {ExtendableEvent} */ (/** @type {unknown} */ ({})),
				/** @type {RouteConfig} */ (/** @type {unknown} */ ({})),
			),
		).type.toBe(
			/** @type {Promise<Response>} */ (/** @type {unknown} */ (undefined)),
		);
	});
});

describe("lib/http", () => {
	test("headersGetAll returns Record<string, string>", () => {
		expect(headersGetAll(new Headers())).type.toBe(
			/** @type {Record<string, string>} */ (
				/** @type {unknown} */ (undefined)
			),
		);
		expect(headersGetAll(undefined)).type.toBe(
			/** @type {Record<string, string>} */ (
				/** @type {unknown} */ (undefined)
			),
		);
	});

	test("urlRemoveHash returns string", () => {
		expect(urlRemoveHash("http://example.com#hash")).type.toBe(
			/** @type {string} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("isRequest is type guard", () => {
		expect(isRequest(/** @type {unknown} */ (undefined))).type.toBe(
			/** @type {boolean} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("newRequest returns Request", () => {
		expect(newRequest("http://example.com")).type.toBe(
			/** @type {Request} */ (/** @type {unknown} */ (undefined)),
		);
		expect(
			newRequest(/** @type {Request} */ (/** @type {unknown} */ ({})), {}),
		).type.toBe(/** @type {Request} */ (/** @type {unknown} */ (undefined)));
	});

	test("addHeaderToRequest returns Request", () => {
		expect(
			addHeaderToRequest(
				/** @type {Request} */ (/** @type {unknown} */ ({})),
				"key",
				"value",
			),
		).type.toBe(/** @type {Request} */ (/** @type {unknown} */ (undefined)));
	});

	test("isResponse is type guard", () => {
		expect(isResponse(/** @type {unknown} */ (undefined))).type.toBe(
			/** @type {boolean} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("newResponse returns Response", () => {
		expect(newResponse({})).type.toBe(
			/** @type {Response} */ (/** @type {unknown} */ (undefined)),
		);
		expect(
			newResponse({ status: 200, url: "http://example.com", body: null }),
		).type.toBe(/** @type {Response} */ (/** @type {unknown} */ (undefined)));
	});

	test("addHeaderToResponse returns Response", () => {
		expect(
			addHeaderToResponse(
				/** @type {Response} */ (/** @type {unknown} */ ({})),
				"key",
				"value",
			),
		).type.toBe(/** @type {Response} */ (/** @type {unknown} */ (undefined)));
	});

	test("deleteHeaderFromResponse returns Response", () => {
		expect(
			deleteHeaderFromResponse(
				/** @type {Response} */ (/** @type {unknown} */ ({})),
				"key",
			),
		).type.toBe(/** @type {Response} */ (/** @type {unknown} */ (undefined)));
	});

	test("HTTP method constants", () => {
		expect(getMethod).type.toBe(
			/** @type {"GET"} */ (/** @type {unknown} */ (undefined)),
		);
		expect(postMethod).type.toBe(
			/** @type {"POST"} */ (/** @type {unknown} */ (undefined)),
		);
		expect(putMethod).type.toBe(
			/** @type {"PUT"} */ (/** @type {unknown} */ (undefined)),
		);
		expect(patchMethod).type.toBe(
			/** @type {"PATCH"} */ (/** @type {unknown} */ (undefined)),
		);
		expect(deleteMethod).type.toBe(
			/** @type {"DELETE"} */ (/** @type {unknown} */ (undefined)),
		);
		expect(headMethod).type.toBe(
			/** @type {"HEAD"} */ (/** @type {unknown} */ (undefined)),
		);
		expect(optionsMethod).type.toBe(
			/** @type {"OPTIONS"} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("authorizationHeader constant", () => {
		expect(authorizationHeader).type.toBe(
			/** @type {"Authorization"} */ (/** @type {unknown} */ (undefined)),
		);
	});
});

describe("lib/postMessage", () => {
	test("postMessageToAll returns Promise<void>", () => {
		expect(postMessageToAll("msg")).type.toBe(
			/** @type {Promise<void>} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("postMessageToFocused returns Promise<void>", () => {
		expect(postMessageToFocused("msg")).type.toBe(
			/** @type {Promise<void>} */ (/** @type {unknown} */ (undefined)),
		);
	});
});
