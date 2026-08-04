/* global Response Headers */

import { deepEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import precacheExtractJSONDefault, { precacheExtractJSON } from "./index.js";

test("precacheExtractJSON", async (t) => {
	await t.test(
		"should return parsed JSON for application/json response",
		async () => {
			const body = JSON.stringify([{ path: "/index.html" }]);
			const response = new Response(body, {
				headers: new Headers({ "Content-Type": "application/json" }),
			});
			const result = await precacheExtractJSON(response);
			deepEqual(result, [{ path: "/index.html" }]);
		},
	);

	await t.test("accepts application/json with charset parameter", async () => {
		const body = JSON.stringify([{ path: "/index.html" }]);
		const response = new Response(body, {
			headers: new Headers({
				"Content-Type": "application/json; charset=utf-8",
			}),
		});
		const result = await precacheExtractJSON(response);
		deepEqual(result, [{ path: "/index.html" }]);
	});

	await t.test("should return empty array for non-JSON response", async () => {
		const response = new Response("<html></html>", {
			headers: new Headers({ "Content-Type": "text/html" }),
		});
		const result = await precacheExtractJSON(response);
		deepEqual(result, []);
	});

	await t.test("throws when JSON body is not an array", async () => {
		const response = new Response(JSON.stringify({ routes: ["/a"] }), {
			headers: new Headers({ "Content-Type": "application/json" }),
		});
		let caught;
		try {
			await precacheExtractJSON(response);
		} catch (e) {
			caught = e;
		}
		strictEqual(caught instanceof TypeError, true);
		strictEqual(/array/.test(caught.message), true);
		// The received type must be reported via `typeof` ("object" here),
		// not hard-coded — the ternary's non-null arm.
		strictEqual(/received object/.test(caught.message), true);
	});

	await t.test(
		"trims surrounding whitespace before matching the media type",
		async () => {
			// A Content-Type with surrounding whitespace (bypassing Headers
			// normalization via a mock) must still be recognized as JSON: the
			// `.trim()` in the chain is what makes startsWith('application/json')
			// hold. Without it the leading spaces would fail the match.
			const routes = [{ path: "/trimmed" }];
			const fakeResponse = {
				headers: { get: () => "  application/json  " },
				json: async () => routes,
			};
			deepEqual(await precacheExtractJSON(fakeResponse), routes);
		},
	);

	await t.test("matches by prefix, not suffix (startsWith)", async () => {
		// "application/json5" starts with "application/json" (so it is treated
		// as JSON) but does NOT end with it — pins startsWith over endsWith.
		const routes = [{ path: "/json5" }];
		const response = new Response(JSON.stringify(routes), {
			headers: new Headers({ "Content-Type": "application/json5" }),
		});
		deepEqual(await precacheExtractJSON(response), routes);
	});

	await t.test(
		"returns empty array when Content-Type header is absent",
		async () => {
			// Covers the `?? ""` fallback when the response has no Content-Type.
			const response = new Response("not json");
			response.headers.delete("Content-Type");
			const result = await precacheExtractJSON(response);
			deepEqual(result, []);
		},
	);

	await t.test("reports `null` when JSON body parses to null", async () => {
		// Covers the `parsed === null ? "null" : typeof parsed` ternary's
		// null arm.
		const response = new Response("null", {
			headers: new Headers({ "Content-Type": "application/json" }),
		});
		let caught;
		try {
			await precacheExtractJSON(response);
		} catch (e) {
			caught = e;
		}
		strictEqual(caught instanceof TypeError, true);
		strictEqual(/null/.test(caught.message), true);
	});

	await t.test("default export is the named export", async () => {
		strictEqual(precacheExtractJSONDefault, precacheExtractJSON);
	});
});
