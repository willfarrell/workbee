/// <reference lib="webworker" />

import cacheControl from "@work-bee/cache-control";
import { describe, expect, test } from "tstyche";

/** @typedef {import("@work-bee/core").AfterMiddleware} AfterMiddleware */

describe("cache-control", () => {
	test("returns CacheControlMiddlewareResult", () => {
		const result = cacheControl({ cacheControl: "max-age=3600" });
		expect(result).type.toBe(
			/** @type {{ afterNetwork: AfterMiddleware }} */ (
				/** @type {unknown} */ (undefined)
			),
		);
	});

	test("afterNetwork is AfterMiddleware", () => {
		const result = cacheControl({ cacheControl: "max-age=3600" });
		expect(result.afterNetwork).type.toBe(
			/** @type {AfterMiddleware} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("requires cacheControl option", () => {
		// @ts-expect-error Expected 1 arguments, but got 0.
		cacheControl();
		// @ts-expect-error Property 'cacheControl' is missing
		cacheControl({});
	});
});
