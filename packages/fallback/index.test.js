/* global Request */

import { deepEqual } from "node:assert";
import test from "node:test";
import { domain, setupMocks } from "../../test-unit/helper.js";
import { pathPattern, strategyCacheOnly } from "../core/index.js";
import fallbackMiddleware from "./index.js";

test("fallbackMiddleware.after: Should skip the request if ok", async (_t) => {
	const request = new Request(`${domain}/200`, { method: "GET" });
	const response = await fetch(request);
	const fallbackPath = `${domain}/cache/found`;
	// const fallbackResponse = await fetch(new Request(fallbackPath))

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		fallbackStrategy: strategyCacheOnly,
	});
	const { event, config } = setupMocks(undefined, fallbackPath);
	const output = await fallback.after(request, response, event, config);

	deepEqual(output, response);
});

test("fallbackMiddleware.after: Should skip the request if not included statusCodes", async (_t) => {
	const request = new Request(`${domain}/404`, { method: "GET" });
	const response = await fetch(request);
	const fallbackPath = `${domain}/cache/found`;
	// const fallbackResponse = await fetch(new Request(fallbackPath))

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		statusCodes: [403],
		fallbackStrategy: strategyCacheOnly,
	});
	const { event, config } = setupMocks(undefined, fallbackPath);
	const output = await fallback.after(request, response, event, config);

	deepEqual(output, response);
});

test("fallbackMiddleware.after: Should request from cache when not ok", async (_t) => {
	const request = new Request(`${domain}/404`, { method: "GET" });
	const response = await fetch(request);
	const fallbackPath = `${domain}/cache/found`;
	const fallbackResponse = await fetch(new Request(fallbackPath));

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		fallbackStrategy: strategyCacheOnly,
	});
	const { event, config } = setupMocks(undefined, fallbackPath);
	const output = await fallback.after(request, response, event, config);

	deepEqual(output, fallbackResponse);
});

test("fallbackMiddleware.after: Should request from cache (default) when not ok", async (_t) => {
	const request = new Request(`${domain}/404`, { method: "GET" });
	const response = await fetch(request);
	const fallbackPath = `${domain}/cache/found`;
	const fallbackResponse = await fetch(new Request(fallbackPath));

	const fallback = fallbackMiddleware({
		path: fallbackPath,
	});
	const { event, config } = setupMocks(undefined, fallbackPath);
	const output = await fallback.after(request, response, event, config);

	deepEqual(output, fallbackResponse);
});

test("fallbackMiddleware.after: Should request when not ok", async (_t) => {
	const request = new Request(`${domain}/404`, { method: "GET" });
	const response = await fetch(request);
	const fallbackPath = `${domain}/cache/found`;
	const fallbackResponse = await fetch(new Request(fallbackPath));

	const fallback = fallbackMiddleware({
		path: fallbackPath,
	});
	const { event, config } = setupMocks(undefined, `${domain}/cache/notfound`);
	const output = await fallback.after(request, response, event, config);

	deepEqual(output, fallbackResponse);
});

test("fallbackMiddleware.after: Should request when not ok and using pathPattern", async (_t) => {
	const request = new Request(`${domain}/404`, { method: "GET" });
	const response = await fetch(request);
	const fallbackPath = `${domain}/$1/200`;
	const fallbackResponse = await fetch(new Request(`${domain}/en/200`));

	const fallback = fallbackMiddleware({
		pathPattern: pathPattern(".+/(en|fr)/.+"),
		path: fallbackPath,
	});
	const { event, config } = setupMocks(undefined, `${domain}/cache/notfound`);
	const output = await fallback.after(request, response, event, config);

	deepEqual(output, fallbackResponse);
});

test("fallbackMiddleware.after: Should replace {status} in path", async (_t) => {
	const request = new Request(`${domain}/404`, { method: "GET" });
	const response = await fetch(request);
	const fallbackPath = `${domain}/{status}`;

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		statusCodes: [404],
		fallbackStrategy: strategyCacheOnly,
	});
	const { event, config } = setupMocks(undefined, `${domain}/404`);
	const output = await fallback.after(request, response, event, config);

	deepEqual(output.status, 404);
});

test("fallbackMiddleware.after: Should handle non-Response error with pathPattern", async (_t) => {
	const request = new Request(`${domain}/en/404`, { method: "GET" });
	const error = new Error("network failure");
	const fallbackPath = `${domain}/$1/200`;
	const fallbackResponse = await fetch(new Request(`${domain}/en/200`));

	const fallback = fallbackMiddleware({
		pathPattern: pathPattern(".+/(en|fr)/.+"),
		path: fallbackPath,
	});
	const { event, config } = setupMocks(undefined, `${domain}/cache/notfound`);
	const output = await fallback.after(request, error, event, config);

	deepEqual(output, fallbackResponse);
});

test("fallbackMiddleware.after: Should handle non-Response error (e.g. thrown Error)", async (_t) => {
	const request = new Request(`${domain}/200`, { method: "GET" });
	const error = new Error("network failure");
	const fallbackPath = `${domain}/cache/found`;
	const fallbackResponse = await fetch(new Request(fallbackPath));

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		fallbackStrategy: strategyCacheOnly,
	});
	const { event, config } = setupMocks(undefined, fallbackPath);
	const output = await fallback.after(request, error, event, config);

	deepEqual(output, fallbackResponse);
});
