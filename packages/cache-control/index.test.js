/* global Request Response */

import { deepEqual, strictEqual } from "node:assert";
import test from "node:test";
import {
	cachesOverride,
	domain,
	fetchOverride,
	setupMocks,
} from "../../fixtures/helper.js";
import cacheControlMiddleware from "./index.js";

// Mocks
Object.assign(global, { caches: cachesOverride, fetch: fetchOverride });

test("cacheControlMiddleware.afterNetwork: Should override the Cache-Control", async (_t) => {
	const request = new Request(`${domain}/200`, { method: "GET" });
	const response = await fetch(request);
	const cacheControlResponse = await fetch(
		new Request(`${domain}/cache-control/no-cache`),
	);
	const cacheControl = cacheControlMiddleware({
		cacheControl: "no-cache",
	});
	const { event, config } = setupMocks();
	strictEqual(response.headers.get("Cache-Control"), "max-age=86400");
	const outputResponse = await cacheControl.afterNetwork(
		request,
		response,
		event,
		config,
	);

	deepEqual(outputResponse, cacheControlResponse);
	strictEqual(outputResponse.headers.get("Cache-Control"), "no-cache");
});

test("cacheControlMiddleware: Should throw when cacheControl is not a non-empty string", async (_t) => {
	const { strictEqual, throws } = await import("node:assert");
	throws(() => cacheControlMiddleware({}), /cacheControl/);
	throws(() => cacheControlMiddleware({ cacheControl: "" }), /cacheControl/);
	throws(() => cacheControlMiddleware({ cacheControl: 123 }), /cacheControl/);
	// Sanity: valid value still works.
	strictEqual(
		typeof cacheControlMiddleware({ cacheControl: "no-cache" }).afterNetwork,
		"function",
	);
});

test("cacheControlMiddleware.afterNetwork: Should skip when response is an error", async (_t) => {
	const request = new Request(`${domain}/offline`, { method: "GET" });
	const response = new Error("offline");
	const cacheControl = cacheControlMiddleware({
		cacheControl: "no-cache",
	});
	const { event, config } = setupMocks();
	const outputResponse = await cacheControl.afterNetwork(
		request,
		response,
		event,
		config,
	);

	deepEqual(outputResponse, response);
});

test("cacheControlMiddleware.afterNetwork: Should return opaque (status 0) responses unchanged", async (_t) => {
	// no-cors / opaqueredirect responses have status 0, which `new Response()`
	// rejects, so rebuilding one to add a header would fail the request.
	const request = new Request(`${domain}/img`, { method: "GET" });
	const response = Response.error();
	const cacheControl = cacheControlMiddleware({
		cacheControl: "no-cache",
	});
	const { event, config } = setupMocks();
	const outputResponse = await cacheControl.afterNetwork(
		request,
		response,
		event,
		config,
	);

	strictEqual(outputResponse, response);
});
