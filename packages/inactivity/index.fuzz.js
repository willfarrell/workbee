/* global Request Response */
import { test } from "node:test";
import fc from "fast-check";
import "../../fixtures/helper.js";
import inactivityMiddleware from "./index.js";

test("fuzz: inactivityMiddleware passes requests and responses through", () => {
	fc.assert(
		fc.property(fc.integer({ min: 1, max: 100 }), (concurrency) => {
			const { before, after } = inactivityMiddleware({
				postMessage: async () => {},
			});
			const request = new Request("http://localhost:8080/200");
			const response = new Response("{}", { status: 200 });

			for (let i = 0; i < concurrency; i++) {
				if (before(request, {}, {}) !== request) return false;
			}
			for (let i = 0; i < concurrency; i++) {
				if (after(request, response, {}, {}) !== response) return false;
			}
			return true;
		}),
		{ numRuns: 200 },
	);
});
