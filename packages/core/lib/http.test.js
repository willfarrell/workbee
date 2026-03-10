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
		"newResponse: should create Response with status and url",
		async () => {
			const response = newResponse({
				status: 201,
				url: "http://localhost:8080/test",
				body: "hello",
			});
			equal(response instanceof Response, true);
			equal(response.status, 201);
			equal(response.url, "http://localhost:8080/test");
			equal(await response.text(), "hello");
		},
	);

	await t.test(
		"newResponse: should auto-set date header when not provided",
		async () => {
			const response = newResponse({ status: 200, url: "", body: "" });
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
			const response = newResponse({ status: 200, url: "", body: "" }, headers);
			equal(response.headers.get("date"), customDate);
		},
	);

	// *** addHeaderToRequest *** //
	await t.test("addHeaderToRequest: should add header to request", async () => {
		const request = new Request("http://localhost:8080/test");
		const result = addHeaderToRequest(request, "X-Custom", "value");
		equal(result instanceof Request, true);
		equal(result.headers.get("X-Custom"), "value");
		equal(result.url, "http://localhost:8080/test");
	});

	// *** addHeaderToResponse *** //
	await t.test(
		"addHeaderToResponse: should add header to response",
		async () => {
			const response = newResponse({
				status: 200,
				url: "http://localhost:8080/test",
				body: "",
			});
			const result = addHeaderToResponse(response, "X-Custom", "value");
			equal(result instanceof Response, true);
			equal(result.headers.get("X-Custom"), "value");
		},
	);

	// *** deleteHeaderFromResponse *** //
	await t.test(
		"deleteHeaderFromResponse: should remove header from response",
		async () => {
			const headers = new Headers({ "X-Remove": "value" });
			const response = newResponse(
				{ status: 200, url: "http://localhost:8080/test", body: "" },
				headers,
			);
			equal(response.headers.get("X-Remove"), "value");
			const result = deleteHeaderFromResponse(response, "X-Remove");
			equal(result.headers.get("X-Remove"), null);
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
