/* global caches Request Response */

import { deepEqual, equal } from "node:assert";
import test from "node:test";
import { domain, setupMocks, spy } from "../../fixtures/helper.js";
import {
	compileConfig,
	fetchInlineStrategy,
	pathPattern,
	strategyCacheOnly,
	strategyNetworkOnly,
} from "../core/index.js";
import fallbackMiddleware from "./index.js";

// setupMocks stubs "sw-default" straight into the mock CacheStorage. Give the
// stub the `store` map that `caches.match` (the default fallback strategy)
// iterates, and remove it after each test so it can't leak into the next.
const setupFallbackMocks = (t, strategy, cacheMatch) => {
	const mocks = setupMocks(strategy, cacheMatch, t);
	mocks.cache.store = new Map();
	return mocks;
};

test("fallbackMiddleware: Should throw when path is missing", async (t) => {
	const { throws } = await import("node:assert");
	throws(() => fallbackMiddleware({}), /path/);
	throws(() => fallbackMiddleware(), /path/);
	throws(() => fallbackMiddleware({ statusCodes: [404] }), /path/);
});

test("fallbackMiddleware: Should throw when path is an empty string", async (t) => {
	const { throws } = await import("node:assert");
	// `path` is a string, so the `typeof path !== "string"` guard passes; the
	// empty-string case must be rejected by the `path.length === 0` check.
	throws(() => fallbackMiddleware({ path: "" }), /path/);
	throws(() => fallbackMiddleware({ path: "", statusCodes: [404] }), /path/);
});

test("fallbackMiddleware.after: Should skip the request if ok", async (t) => {
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
	const { cache, event, config } = setupFallbackMocks(
		t,
		undefined,
		fallbackPath,
	);
	const output = await fallback.after(request, response, event, config);

	// The exact original Response must be returned by reference (not a
	// look-alike fallback Response), and the fallback strategy must not run.
	equal(output, response);
	equal(cache.match.callCount, 0);
});

test("fallbackMiddleware.after: Should skip the request if not included statusCodes", async (t) => {
	const request = new Request(`${domain}/404`, { method: "GET" });
	const response = await fetch(request);
	const fallbackPath = `${domain}/cache/found`;
	// const fallbackResponse = await fetch(new Request(fallbackPath))

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		statusCodes: [403],
		fallbackStrategy: strategyCacheOnly,
	});
	const { cache, event, config } = setupFallbackMocks(
		t,
		undefined,
		fallbackPath,
	);
	const output = await fallback.after(request, response, event, config);

	// 404 is not in statusCodes, so the original Response must be returned by
	// reference and the fallback strategy must not run.
	equal(output, response);
	equal(cache.match.callCount, 0);
});

test("fallbackMiddleware.after: Should request from cache when not ok", async (t) => {
	const request = new Request(`${domain}/404`, { method: "GET" });
	const response = await fetch(request);
	const fallbackPath = `${domain}/cache/found`;
	const fallbackResponse = await fetch(new Request(fallbackPath));

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		fallbackStrategy: strategyCacheOnly,
	});
	const { event, config } = setupFallbackMocks(t, undefined, fallbackPath);
	const output = await fallback.after(request, response, event, config);

	equal(output instanceof Response, true);
	deepEqual(output, fallbackResponse);
});

test("fallbackMiddleware.after: Should request from cache (default) when not ok", async (t) => {
	const request = new Request(`${domain}/404`, { method: "GET" });
	const response = await fetch(request);
	const fallbackPath = `${domain}/cache/found`;
	const fallbackResponse = await fetch(new Request(fallbackPath));

	const fallback = fallbackMiddleware({
		path: fallbackPath,
	});
	const { event, config } = setupFallbackMocks(t, undefined, fallbackPath);
	const output = await fallback.after(request, response, event, config);

	equal(output instanceof Response, true);
	deepEqual(output, fallbackResponse);
});

test("fallbackMiddleware.after: Should request when not ok", async (t) => {
	const request = new Request(`${domain}/404`, { method: "GET" });
	const response = await fetch(request);
	const fallbackPath = `${domain}/cache/found`;
	const fallbackResponse = await fetch(new Request(fallbackPath));

	const fallback = fallbackMiddleware({
		path: fallbackPath,
	});
	const { event, config } = setupFallbackMocks(
		t,
		undefined,
		`${domain}/cache/notfound`,
	);
	const output = await fallback.after(request, response, event, config);

	equal(output instanceof Response, true);
	deepEqual(output, fallbackResponse);
});

test("fallbackMiddleware.after: Should request when not ok and using pathPattern", async (t) => {
	const request = new Request(`${domain}/404`, { method: "GET" });
	const response = await fetch(request);
	const fallbackPath = `${domain}/$1/200`;
	const fallbackResponse = await fetch(new Request(`${domain}/en/200`));

	const fallback = fallbackMiddleware({
		pathPattern: pathPattern(".+/(en|fr)/.+"),
		path: fallbackPath,
	});
	const { event, config } = setupFallbackMocks(
		t,
		undefined,
		`${domain}/cache/notfound`,
	);
	const output = await fallback.after(request, response, event, config);

	equal(output instanceof Response, true);
	deepEqual(output, fallbackResponse);
});

test("fallbackMiddleware.after: Should replace {status} in path", async (t) => {
	const request = new Request(`${domain}/404`, { method: "GET" });
	const response = await fetch(request);
	const fallbackPath = `${domain}/{status}`;

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		statusCodes: [404],
		fallbackStrategy: strategyCacheOnly,
	});
	const { event, config } = setupFallbackMocks(t, undefined, `${domain}/404`);
	const output = await fallback.after(request, response, event, config);

	deepEqual(output.status, 404);
});

test("fallbackMiddleware.after: Should replace {status} for non-Response error (no literal left)", async (t) => {
	const request = new Request(`${domain}/200`, { method: "GET" });
	const error = new Error("network failure");
	const fallbackPath = `${domain}/{status}`;

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		fallbackStrategy: strategyCacheOnly,
	});
	const { cache, event, config } = setupFallbackMocks(
		t,
		undefined,
		`${domain}/cache/found`,
	);
	await fallback.after(request, error, event, config);

	const requestedUrl = cache.match.args[0][0].url;
	// neither the literal nor the URL-encoded placeholder should remain
	deepEqual(/\{status\}|%7Bstatus%7D/i.test(requestedUrl), false);
	deepEqual(requestedUrl, `${domain}/`);
});

test("fallbackMiddleware.after: Should replace all {status} occurrences", async (t) => {
	const request = new Request(`${domain}/404`, { method: "GET" });
	const response = await fetch(request);
	const fallbackPath = `${domain}/{status}/{status}`;

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		statusCodes: [404],
		fallbackStrategy: strategyCacheOnly,
	});
	const { cache, event, config } = setupFallbackMocks(
		t,
		undefined,
		`${domain}/cache/found`,
	);
	await fallback.after(request, response, event, config);

	const requestedUrl = cache.match.args[0][0].url;
	// neither the literal nor the URL-encoded placeholder should remain
	deepEqual(/\{status\}|%7Bstatus%7D/i.test(requestedUrl), false);
	deepEqual(requestedUrl, `${domain}/404/404`);
});

test("fallbackMiddleware.after: Should handle non-Response error with pathPattern", async (t) => {
	const request = new Request(`${domain}/en/404`, { method: "GET" });
	const error = new Error("network failure");
	const fallbackPath = `${domain}/$1/200`;
	const fallbackResponse = await fetch(new Request(`${domain}/en/200`));

	const fallback = fallbackMiddleware({
		pathPattern: pathPattern(".+/(en|fr)/.+"),
		path: fallbackPath,
	});
	const { event, config } = setupFallbackMocks(
		t,
		undefined,
		`${domain}/cache/notfound`,
	);
	const output = await fallback.after(request, error, event, config);

	equal(output instanceof Response, true);
	deepEqual(output, fallbackResponse);
});

test("fallbackMiddleware.after: Should handle non-Response error (e.g. thrown Error)", async (t) => {
	const request = new Request(`${domain}/200`, { method: "GET" });
	const error = new Error("network failure");
	const fallbackPath = `${domain}/cache/found`;
	const fallbackResponse = await fetch(new Request(fallbackPath));

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		fallbackStrategy: strategyCacheOnly,
	});
	const { event, config } = setupFallbackMocks(t, undefined, fallbackPath);
	const output = await fallback.after(request, error, event, config);

	equal(output instanceof Response, true);
	deepEqual(output, fallbackResponse);
});

test("fallbackMiddleware.after: Should handle a nullish (undefined) response without throwing", async (t) => {
	const request = new Request(`${domain}/200`, { method: "GET" });
	const fallbackPath = `${domain}/cache/found`;
	const fallbackResponse = await fetch(new Request(fallbackPath));

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		fallbackStrategy: strategyCacheOnly,
	});
	const { cache, event, config } = setupFallbackMocks(
		t,
		undefined,
		fallbackPath,
	);
	// A nullish `response` must be guarded by `response?.ok`; without the
	// optional chain `response.ok` would throw a TypeError instead of falling
	// through to the fallback strategy.
	const output = await fallback.after(request, undefined, event, config);

	equal(output instanceof Response, true);
	deepEqual(output, fallbackResponse);
	equal(cache.match.callCount, 1);
});

test("fallbackMiddleware.after: Should fetch the fallback as a GET, not copy the original request", async (t) => {
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
	const { cache, event, config } = setupFallbackMocks(
		t,
		undefined,
		fallbackPath,
	);
	await fallback.after(request, error, event, config);

	const fallbackRequest = cache.match.args[0][0];
	equal(fallbackRequest.method, "GET");
	equal(fallbackRequest.url, fallbackPath);
});

test("fallbackMiddleware.after: Should carry the original request's headers onto the fallback request", async (t) => {
	// The fallback is fetched as a fresh GET, but content negotiation must
	// survive: `newRequest(url, { headers: request.headers })` is what keeps
	// Accept / Accept-Language on the fallback so the right variant is served.
	const request = new Request(`${domain}/200`, {
		method: "GET",
		headers: {
			Accept: "text/html",
			"Accept-Language": "fr-CA",
		},
	});
	const error = new Error("network failure");
	const fallbackPath = `${domain}/cache/found`;

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		fallbackStrategy: strategyCacheOnly,
	});
	const { cache, event, config } = setupFallbackMocks(
		t,
		undefined,
		fallbackPath,
	);
	await fallback.after(request, error, event, config);

	const fallbackRequest = cache.match.args[0][0];
	equal(fallbackRequest.headers.get("Accept"), "text/html");
	equal(fallbackRequest.headers.get("Accept-Language"), "fr-CA");
});

test("fallbackMiddleware.after: Should reject when after-hook is given a value that breaks an unguarded ok access", async (t) => {
	const request = new Request(`${domain}/200`, { method: "GET" });
	const fallbackPath = `${domain}/cache/found`;

	const fallback = fallbackMiddleware({
		path: fallbackPath,
		fallbackStrategy: strategyCacheOnly,
	});
	const { event, config } = setupFallbackMocks(t, undefined, fallbackPath);
	// `null` is nullish: `null?.ok` is undefined (falls through), but the
	// unguarded mutant `null.ok` throws a TypeError. Confirm the guarded code
	// resolves rather than rejecting.
	const output = await fallback.after(request, null, event, config);
	deepEqual(output instanceof Response, true);
});

test("fallbackMiddleware.after: Should not re-enter itself when the fallback fetch also fails", async (t) => {
	// Offline and the fallback asset is not cached: the nested fallback fetch
	// fails too. It must not run this same `after` again (which would recurse
	// until OOM). The spy starts succeeding after a few calls only so a
	// regression terminates instead of hanging the test run.
	const originalFetch = global.fetch;
	const fetchSpy = spy(() =>
		fetchSpy.callCount > 5
			? Promise.resolve(new Response("recursed"))
			: Promise.reject(new Error("offline")),
	);
	global.fetch = fetchSpy;
	t.after(() => {
		global.fetch = originalFetch;
	});
	const config = compileConfig({
		cacheName: "fallback-recursion",
		strategy: strategyNetworkOnly,
		middlewares: [fallbackMiddleware({ path: `${domain}/offline.html` })],
	});
	const event = { waitUntil: () => {} };
	const output = await fetchInlineStrategy(
		new Request(`${domain}/page`),
		event,
		config,
	);

	equal(fetchSpy.callCount, 2);
	equal(output instanceof Error, true);
	equal(output.message, "offline");
});

test("fallbackMiddleware.after: Should find the fallback asset in another cache by default", async (t) => {
	// The fallback page is precached under the top-level cacheName, but the
	// failing route has its own cacheName. The default strategy must look it up
	// across all caches rather than only in the failing route's cache.
	const originalFetch = global.fetch;
	const fetchSpy = spy(() => Promise.reject(new Error("offline")));
	global.fetch = fetchSpy;
	const fallbackPath = `${domain}/offline-page.html`;
	const precache = await caches.open("sw-precache");
	await precache.put(fallbackPath, new Response("offline page"));
	t.after(async () => {
		global.fetch = originalFetch;
		await caches.delete("sw-precache");
	});
	const config = compileConfig({
		cacheName: "api",
		strategy: strategyNetworkOnly,
		middlewares: [fallbackMiddleware({ path: fallbackPath })],
	});
	const event = { waitUntil: () => {} };
	const output = await fetchInlineStrategy(
		new Request(`${domain}/api/data`),
		event,
		config,
	);

	equal(await output.text(), "offline page");
	equal(fetchSpy.callCount, 1);
});

test("fallbackMiddleware.after: Should fetch the fallback asset from the network when no cache has it", async (t) => {
	const originalFetch = global.fetch;
	const fetchSpy = spy((request) =>
		request.url === `${domain}/offline-page.html`
			? Promise.resolve(new Response("from network"))
			: Promise.reject(new Error("offline")),
	);
	global.fetch = fetchSpy;
	t.after(() => {
		global.fetch = originalFetch;
	});
	const config = compileConfig({
		cacheName: "api",
		strategy: strategyNetworkOnly,
		middlewares: [fallbackMiddleware({ path: `${domain}/offline-page.html` })],
	});
	const event = { waitUntil: () => {} };
	const output = await fetchInlineStrategy(
		new Request(`${domain}/api/data`),
		event,
		config,
	);

	equal(await output.text(), "from network");
	equal(fetchSpy.callCount, 2);
});

test("fallbackMiddleware.after: Should still run the route's other after hooks on the fallback fetch", async (t) => {
	// Only the fallback's own hook is dropped from the nested run; sibling
	// after-middleware (e.g. logging) must still see the fallback response.
	const originalFetch = global.fetch;
	global.fetch = (request) =>
		request.url === `${domain}/offline-page.html`
			? Promise.resolve(new Response("from network"))
			: Promise.reject(new Error("offline"));
	t.after(() => {
		global.fetch = originalFetch;
	});
	const sibling = { after: spy((_request, response) => response) };
	const config = compileConfig({
		cacheName: "api",
		strategy: strategyNetworkOnly,
		middlewares: [
			fallbackMiddleware({ path: `${domain}/offline-page.html` }),
			sibling,
		],
	});
	const event = { waitUntil: () => {} };
	await fetchInlineStrategy(new Request(`${domain}/api/data`), event, config);

	equal(sibling.after.callCount, 2);
	equal(sibling.after.args[1][0].url, `${domain}/offline-page.html`);
});
