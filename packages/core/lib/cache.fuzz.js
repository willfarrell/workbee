/* global Response */
import { test } from "node:test";
import fc from "fast-check";
import "../../../fixtures/helper.js";
import { cacheExpired } from "./cache.js";

test("fuzz: cacheExpired with arbitrary date strings", () => {
	fc.assert(
		fc.property(fc.string(), (dateStr) => {
			const response = new Response("", {
				headers: { Expires: dateStr },
			});
			const result = cacheExpired(response);
			return typeof result === "boolean";
		}),
		{ numRuns: 1000 },
	);
});

test("fuzz: cacheExpired with valid past/future dates", () => {
	fc.assert(
		fc.property(
			fc.date({ min: new Date("2000-01-01"), max: new Date("2030-01-01") }),
			(date) => {
				const response = new Response("", {
					headers: { Expires: date.toUTCString() },
				});
				const result = cacheExpired(response);
				if (date.getTime() < Date.now()) {
					return result === true;
				}
				return result === false;
			},
		),
		{ numRuns: 1000 },
	);
});

test("fuzz: cacheExpired with no Expires header", () => {
	const nullBodyStatuses = new Set([204, 205, 304]);
	fc.assert(
		fc.property(fc.integer({ min: 200, max: 599 }), (status) => {
			const body = nullBodyStatuses.has(status) ? null : "";
			const response = new Response(body, { status });
			const result = cacheExpired(response);
			return result === false;
		}),
		{ numRuns: 100 },
	);
});

test("fuzz: cacheExpired with null/undefined", () => {
	const result1 = cacheExpired(null);
	const result2 = cacheExpired(undefined);
	return result1 === undefined && result2 === undefined;
});
