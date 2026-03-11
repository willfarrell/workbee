/// <reference lib="webworker" />

import type { AfterMiddleware } from "@work-bee/core";
import fallback from "@work-bee/fallback";
import { describe, expect, test } from "tstyche";

describe("fallback", () => {
	test("returns FallbackMiddlewareResult", () => {
		const result = fallback({});
		expect(result).type.toBe<{ after: AfterMiddleware }>();
	});

	test("after is AfterMiddleware", () => {
		const result = fallback({});
		expect(result.after).type.toBe<AfterMiddleware>();
	});

	test("accepts all options", () => {
		const result = fallback({
			pathPattern: /\.html$/,
			path: "/fallback.html",
			statusCodes: [404, 500],
		});
		expect(result.after).type.toBe<AfterMiddleware>();
	});
});
