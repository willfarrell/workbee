/// <reference lib="webworker" />

import fallback from "@work-bee/fallback";
import { describe, expect, test } from "tstyche";

/** @typedef {import("@work-bee/core").AfterMiddleware} AfterMiddleware */

describe("fallback", () => {
	test("returns FallbackMiddlewareResult", () => {
		const result = fallback({});
		expect(result).type.toBe(
			/** @type {{ after: AfterMiddleware }} */ (
				/** @type {unknown} */ (undefined)
			),
		);
	});

	test("after is AfterMiddleware", () => {
		const result = fallback({});
		expect(result.after).type.toBe(
			/** @type {AfterMiddleware} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("accepts all options", () => {
		const result = fallback({
			pathPattern: /\.html$/,
			path: "/fallback.html",
			statusCodes: [404, 500],
		});
		expect(result.after).type.toBe(
			/** @type {AfterMiddleware} */ (/** @type {unknown} */ (undefined)),
		);
	});
});
