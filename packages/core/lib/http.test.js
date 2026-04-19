/* global Request Response Headers */

import { deepEqual, equal, strictEqual } from "node:assert";
import test from "node:test";
import "../../../fixtures/helper.js";
import {
	addHeaderToRequest,
	addHeaderToResponse,
	authorizationHeader,
	deleteHeaderFromResponse,
	deleteMethod,
	getMethod,
	headersGetAll,
	headMethod,
	isRequest,
	isResponse,
	newRequest,
	newResponse,
	optionsMethod,
	patchMethod,
	postMethod,
	putMethod,
	urlRemoveHash,
} from "../index.js";

test("http", async (t) => {
	// *** headersGetAll *** //
	await t.test(
		"headersGetAll: should return empty object for undefined",
		async () => {
			const result = headersGetAll(undefined);
			deepEqual(result, {});
		},
	);

	await t.test(
		"headersGetAll: should convert Headers to plain object",
		async () => {
			const headers = new Headers({
				"Content-Type": "application/json",
				"X-Custom": "value",
			});
			const result = headersGetAll(headers);
			equal(result["content-type"], "application/json");
			equal(result["x-custom"], "value");
		},
	);

	await t.test(
		"headersGetAll: should handle entries returning nullish",
		async () => {
			const obj = { entries: () => null };
			const result = headersGetAll(obj);
			deepEqual(result, {});
		},
	);

	// *** urlRemoveHash *** //
	await t.test("urlRemoveHash: should strip hash from URL", async () => {
		const result = urlRemoveHash("http://localhost:8080/path#hash");
		equal(result, "http://localhost:8080/path");
	});

	await t.test(
		"urlRemoveHash: should return URL unchanged when no hash",
		async () => {
			const result = urlRemoveHash("http://localhost:8080/path");
			equal(result, "http://localhost:8080/path");
		},
	);

	// *** isRequest *** //
	await t.test("isRequest: should return true for Request", async () => {
		const request = new Request("http://localhost:8080/");
		strictEqual(isRequest(request), true);
	});

	await t.test("isRequest: should return false for non-Request", async () => {
		strictEqual(isRequest({}), false);
		strictEqual(isRequest("string"), false);
	});

	// *** isResponse *** //
	await t.test("isResponse: should return true for Response", async () => {
		const response = new Response("");
		strictEqual(isResponse(response), true);
	});

	await t.test("isResponse: should return false for non-Response", async () => {
		strictEqual(isResponse({}), false);
		strictEqual(isResponse("string"), false);
	});

	// *** newRequest *** //
	await t.test("newRequest: should create Request with url", async () => {
		const request = newRequest("http://localhost:8080/test");
		equal(request instanceof Request, true);
		equal(request.url, "http://localhost:8080/test");
	});

	// *** newResponse *** //
	await t.test(
		"newResponse: should create Response with status and body",
		async () => {
			const response = newResponse({
				status: 201,
				body: "hello",
			});
			equal(response instanceof Response, true);
			equal(response.status, 201);
			equal(await response.text(), "hello");
		},
	);

	await t.test(
		"newResponse: should auto-set date header when not provided",
		async () => {
			const response = newResponse({ status: 200, body: "" });
			const dateHeader = response.headers.get("date");
			equal(typeof dateHeader, "string");
			equal(dateHeader.length > 0, true);
		},
	);

	await t.test(
		"newResponse: should preserve date header when provided",
		async () => {
			const customDate = "Thu, 01 Jan 2026 00:00:00 GMT";
			const headers = new Headers({ date: customDate });
			const response = newResponse({ status: 200, body: "" }, headers);
			equal(response.headers.get("date"), customDate);
		},
	);

	await t.test(
		"newResponse: response.url follows Response spec ('' for synthesized) even when callers pass a url option",
		async () => {
			// Post-shim removal: newResponse no longer monkey-patches Response.url.
			// Callers that need a URL-bearing Response should use Cache.match()
			// fixtures (the platform attaches .url from the request key).
			const response = newResponse({
				status: 200,
				body: "",
				url: "http://localhost:8080/test",
			});
			strictEqual(response.url, "");
		},
	);

	await t.test(
		"newResponse: does not overwrite Date when provided via a Headers instance",
		async () => {
			const customDate = "Thu, 01 Jan 2026 00:00:00 GMT";
			const headers = new Headers({ Date: customDate });
			const response = newResponse({ status: 200, body: "" }, headers);
			equal(response.headers.get("date"), customDate);
		},
	);

	await t.test(
		"newResponse: should leave default url when url is not provided",
		async () => {
			const response = newResponse({ status: 200, body: "" });
			// Response.url defaults to "" per spec; must not be replaced with undefined
			strictEqual(response.url, "");
		},
	);

	await t.test("newResponse: should preserve statusText", async () => {
		const response = newResponse({
			status: 404,
			statusText: "Not Found",
			body: "",
		});
		equal(response.statusText, "Not Found");
	});

	// *** addHeaderToRequest *** //
	await t.test("addHeaderToRequest: should add header to request", async () => {
		const request = new Request("http://localhost:8080/test");
		const result = addHeaderToRequest(request, "X-Custom", "value");
		equal(result instanceof Request, true);
		equal(result.headers.get("X-Custom"), "value");
		equal(result.url, "http://localhost:8080/test");
	});

	await t.test(
		"addHeaderToRequest: should preserve method on non-GET requests",
		async () => {
			const request = new Request("http://localhost:8080/test", {
				method: "POST",
				body: "test-body",
			});
			const result = addHeaderToRequest(request, "Authorization", "Bearer tok");
			equal(result.method, "POST");
			equal(result.headers.get("Authorization"), "Bearer tok");
			equal(await result.text(), "test-body");
		},
	);

	await t.test(
		"addHeaderToRequest: should preserve existing headers",
		async () => {
			const request = new Request("http://localhost:8080/test", {
				headers: { "X-Existing": "keep" },
			});
			const result = addHeaderToRequest(request, "X-New", "added");
			equal(result.headers.get("X-Existing"), "keep");
			equal(result.headers.get("X-New"), "added");
		},
	);

	// *** addHeaderToResponse *** //
	await t.test(
		"addHeaderToResponse: should add header to response",
		async () => {
			const response = newResponse({ status: 200, body: "" });
			const result = addHeaderToResponse(response, "X-Custom", "value");
			equal(result instanceof Response, true);
			equal(result.headers.get("X-Custom"), "value");
		},
	);

	await t.test(
		"addHeaderToResponse: should preserve status and body",
		async () => {
			const response = new Response("response-body", { status: 201 });
			const result = addHeaderToResponse(response, "X-Custom", "value");
			equal(result.status, 201);
			equal(result.headers.get("X-Custom"), "value");
			equal(await result.text(), "response-body");
		},
	);

	await t.test(
		"addHeaderToResponse: does not lock the caller's body stream",
		async () => {
			const response = new Response("original-body", { status: 200 });
			const result = addHeaderToResponse(response, "X-Custom", "value");
			equal(result.headers.get("X-Custom"), "value");
			equal(await result.text(), "original-body");
			// Caller should still be able to read the original response body after.
			equal(await response.text(), "original-body");
		},
	);

	await t.test("addHeaderToResponse: should preserve statusText", async () => {
		const response = new Response("", {
			status: 404,
			statusText: "Not Found",
		});
		const result = addHeaderToResponse(response, "X-Custom", "value");
		equal(result.status, 404);
		equal(result.statusText, "Not Found");
	});

	// *** deleteHeaderFromResponse *** //
	await t.test(
		"deleteHeaderFromResponse: should remove header from response",
		async () => {
			const headers = new Headers({ "X-Remove": "value" });
			const response = newResponse({ status: 200, body: "" }, headers);
			equal(response.headers.get("X-Remove"), "value");
			const result = deleteHeaderFromResponse(response, "X-Remove");
			equal(result.headers.get("X-Remove"), null);
		},
	);

	await t.test(
		"deleteHeaderFromResponse: should preserve status and body",
		async () => {
			const response = new Response("keep-body", { status: 202 });
			const result = deleteHeaderFromResponse(response, "X-Nothing");
			equal(result.status, 202);
			equal(await result.text(), "keep-body");
		},
	);

	// *** Method constants *** //
	await t.test("method constants: should have correct values", async () => {
		equal(getMethod, "GET");
		equal(postMethod, "POST");
		equal(putMethod, "PUT");
		equal(patchMethod, "PATCH");
		equal(deleteMethod, "DELETE");
		equal(headMethod, "HEAD");
		equal(optionsMethod, "OPTIONS");
	});

	// *** authorizationHeader *** //
	await t.test("authorizationHeader: should equal Authorization", async () => {
		equal(authorizationHeader, "Authorization");
	});
});
