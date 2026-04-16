/* global Headers Request Response */
import { test } from "node:test";
import fc from "fast-check";
import "../../../fixtures/helper.js";
import {
	addHeaderToRequest,
	addHeaderToResponse,
	deleteHeaderFromResponse,
	headersGetAll,
	isRequest,
	isResponse,
	newResponse,
	urlRemoveHash,
} from "./http.js";

test("fuzz: headersGetAll with arbitrary headers", () => {
	fc.assert(
		fc.property(
			fc.dictionary(
				fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9-]*$/),
				fc
					.string()
					.filter(
						(s) => !s.includes("\n") && !s.includes("\r") && !s.includes("\0"),
					),
				{ maxKeys: 20 },
			),
			(headerDict) => {
				const headers = new Headers(headerDict);
				const result = headersGetAll(headers);
				return typeof result === "object" && result !== null;
			},
		),
		{ numRuns: 1000 },
	);
});

test("fuzz: headersGetAll with null/undefined", () => {
	const result1 = headersGetAll(null);
	const result2 = headersGetAll(undefined);
	return (
		typeof result1 === "object" &&
		typeof result2 === "object" &&
		Object.keys(result1).length === 0 &&
		Object.keys(result2).length === 0
	);
});

test("fuzz: urlRemoveHash with arbitrary URLs", () => {
	fc.assert(
		fc.property(fc.webUrl(), (url) => {
			const result = urlRemoveHash(url);
			return typeof result === "string" && !result.includes("#");
		}),
		{ numRuns: 1000 },
	);
});

test("fuzz: newResponse with arbitrary status codes", () => {
	// Null-body statuses reject non-null bodies per spec
	const nullBodyStatuses = new Set([204, 205, 304]);
	fc.assert(
		fc.property(
			fc.integer({ min: 200, max: 599 }),
			fc.string(),
			(status, body) => {
				const responseBody = nullBodyStatuses.has(status) ? undefined : body;
				const response = newResponse({ status, body: responseBody });
				return isResponse(response) && response.status === status;
			},
		),
		{ numRuns: 1000 },
	);
});

test("fuzz: addHeaderToRequest with arbitrary key/value", () => {
	fc.assert(
		fc.property(
			fc.constantFrom(
				"X-Custom",
				"X-Test",
				"Accept",
				"Cache-Control",
				"Content-Type",
			),
			fc.stringMatching(/^[a-zA-Z0-9.,;=_-]+$/),
			(key, value) => {
				const request = new Request("http://localhost:8080/test");
				const result = addHeaderToRequest(request, key, value);
				return isRequest(result) && result.headers.get(key) === value;
			},
		),
		{ numRuns: 1000 },
	);
});

test("fuzz: addHeaderToResponse + deleteHeaderFromResponse roundtrip", () => {
	fc.assert(
		fc.property(
			fc.constantFrom(
				"X-Custom",
				"X-Test",
				"Accept",
				"Cache-Control",
				"Content-Type",
			),
			fc.stringMatching(/^[a-zA-Z0-9.,;=_-]+$/),
			(key, value) => {
				const response = new Response("body", { status: 200 });
				const added = addHeaderToResponse(response, key, value);
				const deleted = deleteHeaderFromResponse(added, key);
				return (
					isResponse(added) &&
					added.headers.get(key) === value &&
					isResponse(deleted) &&
					deleted.headers.get(key) === null
				);
			},
		),
		{ numRuns: 1000 },
	);
});
