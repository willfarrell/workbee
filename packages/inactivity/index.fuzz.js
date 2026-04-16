/* global Request Response */
import { test } from "node:test";
import fc from "fast-check";
import "../../fixtures/helper.js";
import inactivityMiddleware from "./index.js";

test("fuzz: inactivityMiddleware with arbitrary timeout values", () => {
	fc.assert(
		fc.property(
			fc.double({ min: 0, max: 1_000_000, noNaN: true }),
			(inactivityAllowedInMin) => {
				const { before, after } = inactivityMiddleware({
					inactivityAllowedInMin,
					inactivityEvent: () => {},
				});
				const request = new Request("http://localhost:8080/200");
				const response = new Response("{}", { status: 200 });
				const event = {};
				const config = {};

				const req = before(request, event, config);
				const res = after(request, response, event, config);
				return req instanceof Request && res instanceof Response;
			},
		),
		{ numRuns: 500 },
	);
});

test("fuzz: inactivityMiddleware concurrent before/after calls", () => {
	fc.assert(
		fc.property(fc.integer({ min: 1, max: 100 }), (concurrency) => {
			const { before, after } = inactivityMiddleware({
				inactivityAllowedInMin: 15,
				inactivityEvent: () => {},
			});
			const request = new Request("http://localhost:8080/200");
			const response = new Response("{}", { status: 200 });

			// Simulate concurrent requests
			for (let i = 0; i < concurrency; i++) {
				before(request, {}, {});
			}
			for (let i = 0; i < concurrency; i++) {
				after(request, response, {}, {});
			}
			return true;
		}),
		{ numRuns: 200 },
	);
});
