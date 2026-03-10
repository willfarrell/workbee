/* global Headers Request Response */
import { test } from "node:test";
import "../../../fixtures/helper.js";
import {
	addHeaderToRequest,
	addHeaderToResponse,
	deleteHeaderFromResponse,
	headersGetAll,
	isRequest,
	isResponse,
	newRequest,
	newResponse,
	urlRemoveHash,
} from "./http.js";

const domain = "http://localhost:8080";

test("perf: newRequest", async () => {
	const iterations = 100_000;
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		newRequest(`${domain}/api/users`);
	}
	const duration = performance.now() - start;
	console.log(
		`newRequest: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: newResponse", async () => {
	const iterations = 100_000;
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		newResponse(
			{ status: 200, url: `${domain}/api/users`, body: "{}" },
			new Headers({ "Content-Type": "application/json" }),
		);
	}
	const duration = performance.now() - start;
	console.log(
		`newResponse: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: isRequest / isResponse", async () => {
	const iterations = 1_000_000;
	const request = new Request(`${domain}/api/users`);
	const response = new Response("{}");
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		isRequest(request);
		isResponse(response);
	}
	const duration = performance.now() - start;
	console.log(
		`isRequest + isResponse: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: headersGetAll", async () => {
	const iterations = 100_000;
	const headers = new Headers({
		"Content-Type": "application/json",
		"Cache-Control": "max-age=86400",
		Date: new Date().toString(),
		Expires: new Date().toString(),
		ETag: '"abc123"',
	});
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		headersGetAll(headers);
	}
	const duration = performance.now() - start;
	console.log(
		`headersGetAll (5 headers): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: addHeaderToRequest", async () => {
	const iterations = 100_000;
	const request = new Request(`${domain}/api/users`);
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		addHeaderToRequest(request, "Authorization", "Bearer token123");
	}
	const duration = performance.now() - start;
	console.log(
		`addHeaderToRequest: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: addHeaderToResponse", async () => {
	const iterations = 100_000;
	const response = new Response("{}", {
		status: 200,
		headers: new Headers({
			"Content-Type": "application/json",
			"Cache-Control": "max-age=86400",
		}),
	});
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		addHeaderToResponse(response, "Expires", new Date().toString());
	}
	const duration = performance.now() - start;
	console.log(
		`addHeaderToResponse: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: deleteHeaderFromResponse", async () => {
	const iterations = 100_000;
	const response = new Response("{}", {
		status: 200,
		headers: new Headers({
			"Content-Type": "application/json",
			Authorization: "Bearer token123",
		}),
	});
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		deleteHeaderFromResponse(response, "Authorization");
	}
	const duration = performance.now() - start;
	console.log(
		`deleteHeaderFromResponse: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: urlRemoveHash", async () => {
	const iterations = 100_000;
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		urlRemoveHash(`${domain}/page#section`);
	}
	const duration = performance.now() - start;
	console.log(
		`urlRemoveHash: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});
