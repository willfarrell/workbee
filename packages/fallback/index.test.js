/* global Request */

import { deepEqual, equal } from "node:assert";
import test from "node:test";
import { domain, setupMocks } from "../../fixtures/helper.js";
import { pathPattern, strategyCacheOnly } from "../core/index.js";
import fallbackMiddleware from "./index.js";

test("fallbackMiddleware: Should throw when path is missing", async (_t) => {
	const { throws } = await import("node:assert");
	throws(() => fallbackMiddleware({}), /path/);
	throws(() => fallbackMiddleware(), /path/);
	throws(() => fallbackMiddleware({ statusCodes: [404] }), /path/);
});

test("fallbackMiddleware: Should throw when path is an empty string", async (_t) => {
	const { throws } = await import("node:assert");
	// `path` is a string, so the `typeof path !== "string"` guard passes; the
	// empty-string case must be rejected by the `path.length === 0` check.
	throws(() => fallbackMiddleware({ path: "" }), /path/);
	throws(() => fallbackMiddleware({ path: "", statusCodes: [404] }), /path/);
});

test("fallbackMiddleware.after: Should skip the request if ok", async (_t) => {
	const request = new Request(`${domain}/200`, { method: "GET" });
	const response = await fetch(request);
	const fallbackPath = `${domain}/cache/found`;
	// const fallbackResponse = await fetch(new Request(fallbackPath))

	// statusCodes includes 200 so the `!statusCodes.includes(status)` guard would
	// NOT short-circuit this response — the early return must come solely from
	// the `response?.ok` branch. If that branch is removed, the code falls
	// through to the fallback (querying the cache and returning a different
	// Response), which the assertions below catch.
	const fallback = fallbackMiddleware({
		path: fallbackPath,
		statusCodes: [200],
		fallbackStrategy: strategyCacheOnly,
	});
	const { cache, event, config } = setupMocks(undefined, fallbackPath);
	const output = await fallback.after(request, response, event, config);

	// The exact original Response must be returned by reference (not a
	// look-alike fallback Response), and the fallback strategy must not run.
	equal(output, response);
	equal(cache.match.callCount, 0);
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
	const { cache, event, config } = setupMocks(undefined, fallbackPath);
	const output = await fallback.after(request, response, event, config);

	// 404 is not in statusCodes, so the original Response must be returned by
	// reference and the fallback strategy must not run.
	equal(output, response);
	equal(cache.match.callCount, 0);
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

test("fallbackMiddleware.after: Should replace {status} for non-Response error (no literal left)", async (_t) => {
	const request = new Request(`${domain}/200`, { method: "GET" });
	const error = new Error("network failure");
	const fallbackPath = `${domain}/{status}`;

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		fallbackStrategy: strategyCacheOnly,
	});
	const { cache, event, config } = setupMocks(
		undefined,
		`${domain}/cache/found`,
	);
	await fallback.after(request, error, event, config);

	const requestedUrl = cache.match.args[0][0].url;
	// neither the literal nor the URL-encoded placeholder should remain
	deepEqual(/\{status\}|%7Bstatus%7D/i.test(requestedUrl), false);
	deepEqual(requestedUrl, `${domain}/`);
});

test("fallbackMiddleware.after: Should replace all {status} occurrences", async (_t) => {
	const request = new Request(`${domain}/404`, { method: "GET" });
	const response = await fetch(request);
	const fallbackPath = `${domain}/{status}/{status}`;

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		statusCodes: [404],
		fallbackStrategy: strategyCacheOnly,
	});
	const { cache, event, config } = setupMocks(
		undefined,
		`${domain}/cache/found`,
	);
	await fallback.after(request, response, event, config);

	const requestedUrl = cache.match.args[0][0].url;
	// neither the literal nor the URL-encoded placeholder should remain
	deepEqual(/\{status\}|%7Bstatus%7D/i.test(requestedUrl), false);
	deepEqual(requestedUrl, `${domain}/404/404`);
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

test("fallbackMiddleware.after: Should handle a nullish (undefined) response without throwing", async (_t) => {
	const request = new Request(`${domain}/200`, { method: "GET" });
	const fallbackPath = `${domain}/cache/found`;
	const fallbackResponse = await fetch(new Request(fallbackPath));

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		fallbackStrategy: strategyCacheOnly,
	});
	const { cache, event, config } = setupMocks(undefined, fallbackPath);
	// A nullish `response` must be guarded by `response?.ok`; without the
	// optional chain `response.ok` would throw a TypeError instead of falling
	// through to the fallback strategy.
	const output = await fallback.after(request, undefined, event, config);

	deepEqual(output, fallbackResponse);
	equal(cache.match.callCount, 1);
});

test("fallbackMiddleware.after: Should fetch the fallback as a GET, not copy the original request", async (_t) => {
	// The failing request may be a POST (or, in a browser, a navigation with
	// `mode: "navigate"` which makes `new Request(url, request)` throw). The
	// fallback asset must be fetched as a plain GET — passing the original
	// `request` as RequestInit would copy its method/body. With the buggy
	// `newRequest(url, request)` the cached lookup would carry method POST.
	const request = new Request(`${domain}/api/data`, {
		method: "POST",
		body: "payload",
	});
	const error = new Error("network failure");
	const fallbackPath = `${domain}/cache/found`;

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		fallbackStrategy: strategyCacheOnly,
	});
	const { cache, event, config } = setupMocks(undefined, fallbackPath);
	await fallback.after(request, error, event, config);

	const fallbackRequest = cache.match.args[0][0];
	equal(fallbackRequest.method, "GET");
	equal(fallbackRequest.url, fallbackPath);
});

test("fallbackMiddleware.after: Should reject when after-hook is given a value that breaks an unguarded ok access", async (_t) => {
	const request = new Request(`${domain}/200`, { method: "GET" });
	const fallbackPath = `${domain}/cache/found`;

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		fallbackStrategy: strategyCacheOnly,
	});
	const { event, config } = setupMocks(undefined, fallbackPath);
	// `null` is nullish: `null?.ok` is undefined (falls through), but the
	// unguarded mutant `null.ok` throws a TypeError. Confirm the guarded code
	// resolves rather than rejecting.
	const output = await fallback.after(request, null, event, config);
	deepEqual(output instanceof Response, true);
});
