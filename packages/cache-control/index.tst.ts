/// <reference lib="webworker" />

import cacheControl from "@work-bee/cache-control";
import type { AfterMiddleware } from "@work-bee/core";
import { describe, expect, test } from "tstyche";

describe("cache-control", () => {
	test("returns CacheControlMiddlewareResult", () => {
		const result = cacheControl({ cacheControl: "max-age=3600" });
		expect(result).type.toBe(
			undefined as unknown as { afterNetwork: AfterMiddleware },
		);
	});

	test("afterNetwork is AfterMiddleware", () => {
		const result = cacheControl({ cacheControl: "max-age=3600" });
		expect(result.afterNetwork).type.toBe(
			undefined as unknown as AfterMiddleware,
		);
	});

	test("requires cacheControl option", () => {
		// @ts-expect-error Expected 1 arguments, but got 0.
		cacheControl();
		// @ts-expect-error Property 'cacheControl' is missing
		cacheControl({});
	});
});
