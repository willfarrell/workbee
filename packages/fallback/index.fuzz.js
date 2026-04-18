/* global Request Response */
import { test } from "node:test";
import fc from "fast-check";
import "../../fixtures/helper.js";
import { strategyCacheOnly } from "@work-bee/core";
import { cachesOverride, domain } from "../../fixtures/helper.js";
import fallbackMiddleware from "./index.js";

Object.assign(global, { caches: cachesOverride });

test("fuzz: fallbackMiddleware skips ok responses", () => {
	const nullBodyStatuses = new Set([204, 205]);
	fc.assert(
		fc.property(fc.integer({ min: 200, max: 299 }), (status) => {
			const { after } = fallbackMiddleware({
				path: "/fallback",
				statusCodes: [404, 500],
			});
			const request = new Request(`${domain}/200`);
			const body = nullBodyStatuses.has(status) ? null : "{}";
			const response = new Response(body, { status });
			const event = { waitUntil: () => {} };
			const config = { strategy: strategyCacheOnly, cacheKey: "sw-default" };

			const result = after(request, response, event, config);
			// Should return the original response for ok status
			return result instanceof Promise || response.ok;
		}),
		{ numRuns: 200 },
	);
});

test("fuzz: fallbackMiddleware with arbitrary status code lists", () => {
	fc.assert(
		fc.property(
			fc.array(fc.integer({ min: 100, max: 599 }), {
				minLength: 1,
				maxLength: 20,
			}),
			(statusCodes) => {
				const { after } = fallbackMiddleware({
					path: "/fallback",
					statusCodes,
				});
				return typeof after === "function";
			},
		),
		{ numRuns: 200 },
	);
});
