/* global Response */
import { test } from "node:test";
import fc from "fast-check";
import "../../fixtures/helper.js";
import { isResponse } from "@work-bee/core";
import cacheControlMiddleware from "./index.js";

test("fuzz: cacheControlMiddleware with arbitrary Cache-Control values", () => {
	fc.assert(
		fc.property(
			fc
				.stringMatching(/^[a-zA-Z0-9.,;=_ -]*$/)
				.filter((s) => s === s.trim() && s.length > 0),
			(cacheControl) => {
				const { afterNetwork } = cacheControlMiddleware({ cacheControl });
				const request = new Request("http://localhost:8080/200");
				const response = new Response("{}", { status: 200 });
				const result = afterNetwork(request, response, {}, {});
				return (
					isResponse(result) &&
					result.headers.get("Cache-Control") === cacheControl
				);
			},
		),
		{ numRuns: 1000 },
	);
});

test("fuzz: cacheControlMiddleware with non-Response values", () => {
	fc.assert(
		fc.property(
			fc.oneof(fc.constant(undefined), fc.constant(null), fc.string()),
			(response) => {
				const { afterNetwork } = cacheControlMiddleware({
					cacheControl: "max-age=60",
				});
				const request = new Request("http://localhost:8080/200");
				const result = afterNetwork(request, response, {}, {});
				return result === response;
			},
		),
		{ numRuns: 100 },
	);
});
