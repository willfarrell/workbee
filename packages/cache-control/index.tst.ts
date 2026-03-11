/// <reference lib="webworker" />

import cacheControl from "@work-bee/cache-control";
import type { AfterMiddleware } from "@work-bee/core";
import { describe, expect, test } from "tstyche";

describe("cache-control", () => {
	test("returns CacheControlMiddlewareResult", () => {
		const result = cacheControl({ cacheControl: "max-age=3600" });
		expect(result).type.toBe<{ afterNetwork: AfterMiddleware }>();
	});

	test("afterNetwork is AfterMiddleware", () => {
		const result = cacheControl({ cacheControl: "max-age=3600" });
		expect(result.afterNetwork).type.toBe<AfterMiddleware>();
	});

	test("requires cacheControl option", () => {
		expect(cacheControl).type.not.toBeCallableWith();
		expect(cacheControl).type.not.toBeCallableWith({});
	});
});
