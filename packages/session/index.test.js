/* global Request Response Headers */

import { deepEqual, strictEqual } from "node:assert";
import { mock, test } from "node:test";
import {
	cachesOverride,
	domain,
	fetchOverride,
	spy,
} from "../../fixtures/helper.js";
import sessionMiddleware, {
	getExpiryJWT,
	getExpiryPaseto,
	getTokenAuthorization,
	setTokenAuthorization,
} from "./index.js";

// Mocks
Object.assign(global, {
	caches: Object.assign(cachesOverride, { delete: spy() }),
	fetch: fetchOverride,
});
// Service worker global scope: the SW is served from `domain`, so its origin is
// `http://localhost:8080`. Same-origin authz requests must receive the token;
// cross-origin requests must not (unless allow-listed).
Object.defineProperty(global, "self", {
	value: { location: new URL(`${domain}/sw.js`) },
	writable: true,
	configurable: true,
});

// --- getTokenAuthorization ---
test("getTokenAuthorization: Should extract Bearer token from Authorization header", async (_t) => {
	const response = new Response("", {
		headers: new Headers({
			Authorization: "Bearer test-token-abc",
		}),
	});
	const token = getTokenAuthorization(response);
	strictEqual(token, "test-token-abc");
});

test("getTokenAuthorization: Should return undefined when no Authorization header", async (_t) => {
	const response = new Response("", {
		headers: new Headers({}),
	});
	const token = getTokenAuthorization(response);
	strictEqual(token, undefined);
});

// --- setTokenAuthorization ---
test("setTokenAuthorization: Should add Bearer token to request Authorization header", async (_t) => {
	const request = new Request(`${domain}/api/data`);
	const result = setTokenAuthorization(request, "my-token-123");
	strictEqual(result.headers.get("Authorization"), "Bearer my-token-123");
});

// --- getExpiryJWT ---
test("getExpiryJWT: Should extract expiry from JWT payload", async (_t) => {
	const exp = Math.floor(Date.now() / 1000) + 3600;
	const header = btoa(JSON.stringify({ alg: "HS256" }));
	const payload = btoa(JSON.stringify({ exp }));
	const signature = "fake-signature";
	const token = `${header}.${payload}.${signature}`;
	const response = new Response("");
	const result = getExpiryJWT(response, token);
	// Should be approximately 3600 * 1000 ms (within 1 second tolerance)
	strictEqual(result > 3599 * 1000, true);
	strictEqual(result <= 3600 * 1000, true);
});

// --- getExpiryJWT error path ---
test("getExpiryJWT: Should return 0 for invalid token", async (_t) => {
	const response = new Response("");
	const result = getExpiryJWT(response, "invalid-token");
	strictEqual(result, 0);
});

test("getExpiryJWT: Should return 0 for malformed JSON in payload", async (_t) => {
	const response = new Response("");
	const result = getExpiryJWT(response, "header.notbase64.signature");
	strictEqual(result, 0);
});

test("getExpiryJWT: Should return 0 when exp claim is missing", async (_t) => {
	const header = btoa(JSON.stringify({ alg: "HS256" }));
	const payload = btoa(JSON.stringify({ sub: "user" })); // no exp
	const token = `${header}.${payload}.signature`;
	const response = new Response("");
	const result = getExpiryJWT(response, token);
	strictEqual(result, 0);
	strictEqual(Number.isNaN(result), false);
});

test("getExpiryJWT: Should return 0 when exp is not a number", async (_t) => {
	const header = btoa(JSON.stringify({ alg: "HS256" }));
	const payload = btoa(JSON.stringify({ exp: "not-a-number" }));
	const token = `${header}.${payload}.signature`;
	const response = new Response("");
	const result = getExpiryJWT(response, token);
	strictEqual(result, 0);
	strictEqual(Number.isNaN(result), false);
});

test("getExpiryJWT: Should decode base64url-encoded payloads with - and _", async (_t) => {
	const exp = Math.floor(Date.now() / 1000) + 3600;
	// Pick a JSON payload whose standard-base64 encoding contains + or /,
	// so the base64url variant contains - or _.
	const payload = btoa(JSON.stringify({ exp, nonce: "?>>?" }))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	strictEqual(/[-_]/.test(payload), true);
	const token = `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
	const result = getExpiryJWT(new Response(""), token);
	strictEqual(result > 0, true);
});

// --- getExpiryPaseto ---
test("getExpiryPaseto: Should extract expiry from PASETO footer", async (_t) => {
	const exp = new Date(Date.now() + 7200 * 1000).toISOString();
	const header = "v4";
	const purpose = "public";
	const footer = btoa(JSON.stringify({ exp }));
	const token = `${header}.${purpose}.${footer}`;
	const response = new Response("");
	const result = getExpiryPaseto(response, token);
	// Should be approximately 7200 * 1000 ms (within 1 second tolerance)
	strictEqual(result > 7199 * 1000, true);
	strictEqual(result <= 7200 * 1000, true);
});

test("getExpiryPaseto: Should decode base64url footer on 4-part PASETO", async (_t) => {
	const exp = new Date(Date.now() + 7200 * 1000).toISOString();
	const payload = "payload-blob";
	const footer = btoa(JSON.stringify({ exp, kid: "?>>?" }))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	strictEqual(/[-_]/.test(footer), true);
	const token = `v4.public.${payload}.${footer}`;
	const result = getExpiryPaseto(new Response(""), token);
	strictEqual(result > 7199 * 1000, true);
	strictEqual(result <= 7200 * 1000, true);
});

// --- getExpiryPaseto error path ---
test("getExpiryPaseto: Should return 0 for invalid token", async (_t) => {
	const response = new Response("");
	const result = getExpiryPaseto(response, "invalid-token");
	strictEqual(result, 0);
});

test("getExpiryPaseto: Should return 0 for malformed JSON in footer", async (_t) => {
	const response = new Response("");
	const result = getExpiryPaseto(response, "v4.public.notbase64");
	strictEqual(result, 0);
});

test("getExpiryPaseto: Should return 0 when exp is invalid date", async (_t) => {
	const footer = btoa(JSON.stringify({ exp: "not-a-date" }));
	const token = `v4.public.${footer}`;
	const response = new Response("");
	const result = getExpiryPaseto(response, token);
	strictEqual(result, 0);
	strictEqual(Number.isNaN(result), false);
});

// --- sessionMiddleware with authzPathPattern ---
test("sessionMiddleware: before should add Authorization header to matching requests", async (_t) => {
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken: () => "test-token-123",
		authnGetExpiry: () => 60000,
		postMessage: mock.fn(),
	});

	// First authenticate to set the sessionToken
	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token-123" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	// Now before should add token to matching request
	const apiRequest = new Request(`${domain}/api/data`);
	const result = session.before(apiRequest, {}, {});
	strictEqual(result.headers.get("Authorization"), "Bearer test-token-123");
	session.destroy();
});

test("sessionMiddleware: before should skip non-matching requests", async (_t) => {
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken: () => "test-token-123",
		authnGetExpiry: () => 60000,
		postMessage: mock.fn(),
	});

	// Authenticate first
	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token-123" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	// before should not add token to non-matching request
	const otherRequest = new Request(`${domain}/public/page`);
	const result = session.before(otherRequest, {}, {});
	strictEqual(result.headers.get("Authorization"), null);
	session.destroy();
});

test("sessionMiddleware: before should not set Authorization header when sessionToken is empty", async (_t) => {
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		postMessage: mock.fn(),
	});

	// No authentication happened, sessionToken is empty
	const apiRequest = new Request(`${domain}/api/data`);
	const result = session.before(apiRequest, {}, {});
	strictEqual(result.headers.get("Authorization"), null);
});

// --- sessionMiddleware with default authnGetExpiry ---
test("sessionMiddleware: should use default authnGetExpiry when not provided", async (_t) => {
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken: () => "test-token",
		postMessage: mock.fn(),
	});

	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	const apiRequest = new Request(`${domain}/api/data`);
	const result = session.before(apiRequest, {}, {});
	strictEqual(result.headers.get("Authorization"), "Bearer test-token");
	session.destroy();
});

// --- sessionMiddleware without authzPathPattern ---
test("sessionMiddleware: before and after should be undefined without authzPathPattern", async (_t) => {
	const session = sessionMiddleware({
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		postMessage: mock.fn(),
	});
	strictEqual(session.before, undefined);
	strictEqual(session.after, undefined);
});

// --- sessionMiddleware with authnPathPattern ---
test("sessionMiddleware: afterNetwork should extract token and strip Authorization header", async (_t) => {
	const authnGetToken = mock.fn(() => "extracted-token");
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken,
		authnGetExpiry: () => 60000,
		postMessage: mock.fn(),
	});

	const request = new Request(`${domain}/auth/login`, { method: "POST" });
	const response = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer extracted-token" }),
	});

	const result = await session.afterNetwork(
		request,
		response,
		{},
		{ cacheKey: "sw-default" },
	);
	strictEqual(authnGetToken.mock.callCount(), 1);
	strictEqual(result.headers.get("Authorization"), null);
	session.destroy();
});

// --- afterNetwork must not start a session when no token is extracted ---
test("sessionMiddleware: afterNetwork should not arm timers or store a token when none is extracted", async (_t) => {
	// authnPathPattern + POST match, but the response carries no token. The
	// guard must skip the expiry lookup and the timers entirely; without it,
	// `sessionToken` would be set to `undefined` and the timers armed pointlessly.
	const authnGetExpiry = mock.fn(() => 60000);
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		authnGetToken: () => undefined,
		authnGetExpiry,
		expiryEventType: "session-expired",
		postMessage: mock.fn(),
	});

	const request = new Request(`${domain}/auth/login`, { method: "POST" });
	const response = new Response("{}", { status: 200 });
	const result = await session.afterNetwork(
		request,
		response,
		{},
		{ cacheKey: "sw-default" },
	);

	// The expiry callback is never consulted (proves the body was skipped).
	strictEqual(authnGetExpiry.mock.callCount(), 0);
	// No token is stored: a later authz request is not authenticated.
	const apiRequest = new Request(`${domain}/api/data`);
	const after = session.before(apiRequest, {}, {});
	strictEqual(after.headers.get("Authorization"), null);
	// The response is still returned (Authorization stripping is a no-op here).
	strictEqual(result instanceof Response, true);
	session.destroy();
});

// --- sessionMiddleware without authnPathPattern/unauthnPathPattern ---
test("sessionMiddleware: afterNetwork should be undefined without authnPathPattern and unauthnPathPattern", async (_t) => {
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		postMessage: mock.fn(),
	});
	strictEqual(session.afterNetwork, undefined);
});

// --- sessionMiddleware afterNetwork skips non-matching URLs ---
test("sessionMiddleware: afterNetwork should skip non-matching URLs", async (_t) => {
	const authnGetToken = mock.fn(() => "token");
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken,
		authnGetExpiry: () => 60000,
		postMessage: mock.fn(),
	});

	const request = new Request(`${domain}/other/path`, { method: "POST" });
	const response = new Response("{}", { status: 200 });

	const result = await session.afterNetwork(
		request,
		response,
		{},
		{ cacheKey: "sw-default" },
	);
	strictEqual(authnGetToken.mock.callCount(), 0);
	strictEqual(result, response);
});

// --- sessionMiddleware afterNetwork skips non-Response (Error) ---
test("sessionMiddleware: afterNetwork should skip non-Response values", async (_t) => {
	const authnGetToken = mock.fn(() => "token");
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken,
		authnGetExpiry: () => 60000,
		postMessage: mock.fn(),
	});

	const request = new Request(`${domain}/auth/login`, { method: "POST" });
	const error = new Error("network error");

	const result = await session.afterNetwork(
		request,
		error,
		{},
		{ cacheKey: "sw-default" },
	);
	strictEqual(authnGetToken.mock.callCount(), 0);
	strictEqual(result, error);
});

// --- Lines 62-67: after middleware tracks sessionCaches and calls activityEvent ---
test("sessionMiddleware: after should track sessionCaches for authz-matching requests", async (_t) => {
	const postMessageMock = mock.fn();
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 60000,
		postMessage: postMessageMock,
	});

	// Authenticate first
	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-session-cache" },
	);

	// Call after with an authz-matching request
	const apiRequest = new Request(`${domain}/api/data`);
	const apiResponse = new Response("{}", { status: 200 });
	const result = session.after(
		apiRequest,
		apiResponse,
		{},
		{ cacheKey: "sw-session-cache" },
	);

	strictEqual(result, apiResponse);

	// Now logout should delete the tracked cache
	const logoutRequest = new Request(`${domain}/auth/logout`, {
		method: "POST",
	});
	const logoutResponse = new Response("{}", { status: 200 });
	await session.afterNetwork(
		logoutRequest,
		logoutResponse,
		{},
		{ cacheKey: "sw-session-cache" },
	);

	// caches.delete should have been called with the tracked cache key
	strictEqual(global.caches.delete.callCount >= 1, true);
});

test("sessionMiddleware: after should return response for non-matching requests", async (_t) => {
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		postMessage: mock.fn(),
	});

	const request = new Request(`${domain}/public/page`);
	const response = new Response("{}", { status: 200 });
	const result = session.after(
		request,
		response,
		{},
		{ cacheKey: "sw-default" },
	);

	// Should still return the response (activityEvent is called but no cache tracking)
	strictEqual(result, response);
});

// --- Lines 88-89: afterNetwork with unauthnPathPattern triggers clearSession ---
test("sessionMiddleware: afterNetwork with logout URL should clear session", async (_t) => {
	const postMessageMock = mock.fn();
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 60000,
		postMessage: postMessageMock,
	});

	// Authenticate first
	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-cache-1" },
	);

	// Track a cache via after
	const apiRequest = new Request(`${domain}/api/data`);
	const apiResponse = new Response("{}", { status: 200 });
	session.after(apiRequest, apiResponse, {}, { cacheKey: "sw-cache-1" });

	// Logout
	const logoutRequest = new Request(`${domain}/auth/logout`, {
		method: "POST",
	});
	const logoutResponse = new Response("{}", { status: 200 });
	await session.afterNetwork(
		logoutRequest,
		logoutResponse,
		{},
		{ cacheKey: "sw-cache-1" },
	);

	// After clearSession, before should not set Authorization header (sessionToken is "")
	const newApiRequest = new Request(`${domain}/api/data`);
	const result = session.before(newApiRequest, {}, {});
	strictEqual(result.headers.get("Authorization"), null);
});

// --- Lines 112-115: sessionTimer fires and calls postMessage with expiryEventType ---
test("sessionMiddleware: sessionTimer should call postMessage with expiryEventType when session expires", async (_t) => {
	mock.timers.enable({ apis: ["setTimeout"] });

	const postMessageMock = mock.fn();
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 5000,
		expiryEventType: "session-expired",
		postMessage: postMessageMock,
	});

	// Authenticate to start the sessionTimer
	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	// Advance time past sessionExpiresInMiliseconds (5000ms)
	mock.timers.tick(5001);

	strictEqual(postMessageMock.mock.callCount() >= 1, true);
	deepEqual(
		postMessageMock.mock.calls[postMessageMock.mock.callCount() - 1]
			.arguments[0],
		{ type: "session-expired" },
	);

	mock.timers.reset();
});

test("sessionMiddleware: sessionTimer should not call postMessage when expiryEventType is not set", async (_t) => {
	mock.timers.enable({ apis: ["setTimeout"] });

	const postMessageMock = mock.fn();
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 5000,
		postMessage: postMessageMock,
	});

	// Authenticate to start the sessionTimer
	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	// Advance time past sessionExpiresInMiliseconds (5000ms)
	mock.timers.tick(5001);

	// postMessage should not have been called (no expiryEventType)
	strictEqual(postMessageMock.mock.callCount(), 0);

	mock.timers.reset();
});

// --- Lines 120-126: clearSession deletes tracked caches ---
test("sessionMiddleware: clearSession should delete all tracked caches", async (_t) => {
	// Reset global caches.delete mock
	const cachesDeleteMock = mock.fn();
	const origDelete = global.caches.delete;
	global.caches.delete = cachesDeleteMock;

	const postMessageMock = mock.fn();
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 60000,
		postMessage: postMessageMock,
	});

	// Authenticate
	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	// Track multiple caches via after
	const apiRequest1 = new Request(`${domain}/api/data1`);
	session.after(
		apiRequest1,
		new Response("{}"),
		{},
		{ cacheKey: "sw-cache-a" },
	);

	const apiRequest2 = new Request(`${domain}/api/data2`);
	session.after(
		apiRequest2,
		new Response("{}"),
		{},
		{ cacheKey: "sw-cache-b" },
	);

	// Logout to trigger clearSession
	const logoutRequest = new Request(`${domain}/auth/logout`, {
		method: "POST",
	});
	const logoutResponse = new Response("{}", { status: 200 });
	await session.afterNetwork(
		logoutRequest,
		logoutResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	// caches.delete should have been called for each tracked cache key
	strictEqual(cachesDeleteMock.mock.callCount(), 2);
	const deletedKeys = cachesDeleteMock.mock.calls.map((c) => c.arguments[0]);
	strictEqual(deletedKeys.includes("sw-cache-a"), true);
	strictEqual(deletedKeys.includes("sw-cache-b"), true);

	// Restore
	global.caches.delete = origDelete;
});

// --- Lines 131-140: expiryPromptEvent ---
test("sessionMiddleware: inactivity prompt should fire postMessage when user is inactive", async (_t) => {
	mock.timers.enable({ apis: ["setTimeout"] });

	const postMessageMock = mock.fn();
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 10000,
		inactivityPromptEventType: "inactivity-prompt",
		postMessage: postMessageMock,
	});

	// Authenticate to start the inactivityTimer
	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	// The inactivityTimer fires at: recentActivityTimestamp + sessionExpiresInMiliseconds - inactivityTimeoutBuffer - now()
	// At login, recentActivityTimestamp is ~now, so timeout is ~sessionExpires - buffer = 10000 - 60000 = negative
	// This means the timer fires immediately or very soon.
	// Advance enough time that the inactivity timer fires and the user is considered inactive
	// (recentActivityTimestamp < now() - sessionExpiresInMiliseconds + inactivityTimeoutBuffer)
	mock.timers.tick(10000);

	// Should have called postMessage with the inactivity prompt type
	const promptCalls = postMessageMock.mock.calls.filter(
		(c) => c.arguments[0]?.type === "inactivity-prompt",
	);
	strictEqual(promptCalls.length >= 1, true);

	mock.timers.reset();
});

test("sessionMiddleware: inactivity prompt should restart timer when user has recent activity", async (_t) => {
	mock.timers.enable({ apis: ["setTimeout"] });

	const postMessageMock = mock.fn();
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 120000,
		inactivityPromptEventType: "inactivity-prompt",
		postMessage: postMessageMock,
	});

	// Authenticate
	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	// Simulate activity just before the inactivity timer would fire
	// The inactivity timeout = recentActivityTimestamp + 120000 - 60000 - now() = 60000ms
	mock.timers.tick(30000);

	// Trigger activityEvent (simulates user activity which updates recentActivityTimestamp)
	session.activityEvent();

	// Advance to when the original inactivity timer fires (at 60000ms total)
	mock.timers.tick(30000);

	// At this point the timer fires, but user was active at 30000ms
	// recentActivityTimestamp (30000) vs now() - sessionExpires + buffer = 60000 - 120000 + 60000 = 0
	// 30000 < 0 is false, so it should restart the inactivityTimer (else branch)
	// No inactivity prompt should have been sent
	const promptCalls = postMessageMock.mock.calls.filter(
		(c) => c.arguments[0]?.type === "inactivity-prompt",
	);
	strictEqual(promptCalls.length, 0);

	mock.timers.reset();
});

// --- M5: boundary case must prompt, not busy-loop ---
test("sessionMiddleware: inactivity prompt should fire at the expiry boundary (no busy loop)", async (_t) => {
	// Mock Date too so `now()` advances with the virtual clock; otherwise the
	// boundary comparison reads real wall-clock time and never lines up.
	mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });

	const postMessageMock = mock.fn();
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 120000,
		inactivityPromptEventType: "inactivity-prompt",
		postMessage: postMessageMock,
	});

	// Authenticate at t0. recentActivityTimestamp === now().
	// inactivityTimer fires at recentActivityTimestamp + 120000 - 60000 - now()
	// = 60000ms. At that boundary recentActivityTimestamp === now() - 120000 +
	// 60000, so the prompt must fire instead of re-arming setTimeout(0).
	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	// Advance to exactly the boundary. Without the fix this re-arms
	// setTimeout(0) and never posts the prompt.
	mock.timers.tick(60000);

	const promptCalls = postMessageMock.mock.calls.filter(
		(c) => c.arguments[0]?.type === "inactivity-prompt",
	);
	strictEqual(promptCalls.length, 1);

	session.destroy();
	mock.timers.reset();
});

// --- Atomic token+expiry assignment ---
test("sessionMiddleware: before should not see sessionToken until expiry resolves", async (_t) => {
	let resolveExpiry;
	const expiryPromise = new Promise((resolve) => {
		resolveExpiry = resolve;
	});
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		authnGetToken: () => "pending-token",
		authnGetExpiry: () => expiryPromise,
		postMessage: mock.fn(),
	});

	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer pending-token" }),
	});
	const afterNetworkPromise = session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	// Let the first await (authnGetToken) settle.
	await new Promise((resolve) => setImmediate(resolve));

	// before runs between the two awaits — Authorization should NOT be set yet.
	const midRequest = new Request(`${domain}/api/data`);
	const mid = session.before(midRequest, {}, {});
	strictEqual(mid.headers.get("Authorization"), null);

	// Complete the expiry resolution and full commit.
	resolveExpiry(60000);
	await afterNetworkPromise;

	// Now the token is live.
	const lateRequest = new Request(`${domain}/api/data`);
	const late = session.before(lateRequest, {}, {});
	strictEqual(late.headers.get("Authorization"), "Bearer pending-token");
	session.destroy();
});

// --- Edge case: token with spaces ---
test("getTokenAuthorization: Should handle token containing spaces after first space", async (_t) => {
	const response = new Response("", {
		headers: new Headers({
			Authorization: "Bearer token-part1 extra-part2",
		}),
	});
	// split(" ")[1] only returns the first segment after "Bearer "
	const token = getTokenAuthorization(response);
	strictEqual(token, "token-part1");
});

// --- Edge case: destroy mid-timer ---
test("sessionMiddleware: destroy should safely clear all timers", async (_t) => {
	mock.timers.enable({ apis: ["setTimeout"] });

	const postMessageMock = mock.fn();
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 10000,
		expiryEventType: "session-expired",
		inactivityPromptEventType: "inactivity-prompt",
		postMessage: postMessageMock,
	});

	// Authenticate to start timers
	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	// Destroy mid-timer — should not throw
	session.destroy();

	// Advance past all timeouts — no postMessage should fire
	mock.timers.tick(20000);
	strictEqual(postMessageMock.mock.callCount(), 0);

	mock.timers.reset();
});

// --- Edge case: before returns unmodified request URL after auth ---
test("sessionMiddleware: before should preserve request URL when adding auth", async (_t) => {
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 60000,
		postMessage: mock.fn(),
	});

	// Authenticate
	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	const apiRequest = new Request(`${domain}/api/data`);
	const result = session.before(apiRequest, {}, {});
	strictEqual(result.url, apiRequest.url);
	strictEqual(result.headers.get("Authorization"), "Bearer test-token");
	session.destroy();
});

// --- H2: cross-origin token leakage ---
const authenticateSession = async (session) => {
	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-default" },
	);
};

test("sessionMiddleware: before should NOT attach token to cross-origin requests", async (_t) => {
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 60000,
		postMessage: mock.fn(),
	});
	await authenticateSession(session);

	// A page-triggered request to a cross-origin URL that still matches the
	// authzPathPattern must NOT receive the live session token.
	const attackerRequest = new Request("https://attacker.example/api/steal");
	const result = session.before(attackerRequest, {}, {});
	strictEqual(result.headers.get("Authorization"), null);
	session.destroy();
});

test("sessionMiddleware: before should attach token to same-origin requests", async (_t) => {
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 60000,
		postMessage: mock.fn(),
	});
	await authenticateSession(session);

	// Same-origin (SW origin === request origin) match still receives the token.
	const apiRequest = new Request(`${domain}/api/data`);
	const result = session.before(apiRequest, {}, {});
	strictEqual(result.headers.get("Authorization"), "Bearer test-token");
	session.destroy();
});

test("sessionMiddleware: before should attach token to allow-listed cross-origin requests", async (_t) => {
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 60000,
		authzAllowedOrigins: ["https://api.trusted.example"],
		postMessage: mock.fn(),
	});
	await authenticateSession(session);

	// An explicitly allow-listed cross-origin API receives the token.
	const trustedRequest = new Request("https://api.trusted.example/api/data");
	const trusted = session.before(trustedRequest, {}, {});
	strictEqual(trusted.headers.get("Authorization"), "Bearer test-token");

	// The SW origin is no longer implicitly allowed once an allow-list is given.
	const sameOriginRequest = new Request(`${domain}/api/data`);
	const sameOrigin = session.before(sameOriginRequest, {}, {});
	strictEqual(sameOrigin.headers.get("Authorization"), null);

	// A non-listed cross-origin request is still rejected.
	const otherRequest = new Request("https://attacker.example/api/steal");
	const other = session.before(otherRequest, {}, {});
	strictEqual(other.headers.get("Authorization"), null);
	session.destroy();
});

test("sessionMiddleware: before should attach token to same-origin requests when authzAllowedOrigins is empty", async (_t) => {
	// FINDING #6: an explicit empty allow-list is NOT a "block everything" knob
	// (just omit authzPathPattern for that). `[] ?? x` keeps the empty array, so
	// the old derivation made isAllowedOrigin return false for every origin —
	// even same-origin — and the token was never attached. An empty/non-array
	// allow-list must fall back to the same-origin default.
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 60000,
		authzAllowedOrigins: [],
		postMessage: mock.fn(),
	});
	await authenticateSession(session);

	// Same-origin request must still receive the token.
	const apiRequest = new Request(`${domain}/api/data`);
	const result = session.before(apiRequest, {}, {});
	strictEqual(result.headers.get("Authorization"), "Bearer test-token");

	// The cross-origin guard (H2) is preserved: a cross-origin request is still
	// rejected under the same-origin default.
	const attackerRequest = new Request("https://attacker.example/api/steal");
	const attacker = session.before(attackerRequest, {}, {});
	strictEqual(attacker.headers.get("Authorization"), null);
	session.destroy();
});

test("sessionMiddleware: before should NOT attach token when request URL is unparseable", async (_t) => {
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 60000,
		postMessage: mock.fn(),
	});
	await authenticateSession(session);

	// A request whose `url` matches the authz pattern but is not a valid
	// absolute URL: `new URL(url)` throws, so the origin cannot be verified and
	// the token must NOT be attached.
	const fakeRequest = { url: "relative/api/data" };
	const result = session.before(fakeRequest, {}, {});
	strictEqual(result, fakeRequest);
	session.destroy();
});

test("sessionMiddleware: before should NOT attach token when SW origin cannot be derived", async (_t) => {
	// Fail closed: when `self`/`location` is unavailable no allow-list can be
	// resolved, so the token must NOT be attached. The middleware must still
	// build without throwing — `globalThis.self?.location?.origin` tolerates the
	// missing `self` (the mutant dropping that optional chain would throw here).
	const descriptor = Object.getOwnPropertyDescriptor(global, "self");
	Object.defineProperty(global, "self", {
		value: undefined,
		writable: true,
		configurable: true,
	});
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 60000,
		postMessage: mock.fn(),
	});
	await authenticateSession(session);

	const apiRequest = new Request(`${domain}/api/data`);
	const result = session.before(apiRequest, {}, {});
	strictEqual(result.headers.get("Authorization"), null);
	session.destroy();

	Object.defineProperty(global, "self", descriptor);
});

// --- Default authnGetExpiry value (12h === 43200000ms) ---
test("sessionMiddleware: default authnGetExpiry should expire the session at exactly 12h", async (_t) => {
	// No authnGetExpiry passed: the default `() => 12 * 60 * 60 * 1000` must yield
	// 43_200_000ms. Pin Date so the sessionTimer (which uses
	// sessionExpiresInMilliseconds directly) fires deterministically. This kills
	// the default-arrow mutant (=> undefined, fires at 0) and every arithmetic
	// mutant on 12 * 60 * 60 * 1000 (12000 / 12000 / 43.2), all of which fire well
	// before the real 43_200_000ms boundary.
	mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });

	const postMessageMock = mock.fn();
	const session = sessionMiddleware({
		authnPathPattern: /\/auth\/login/,
		authnGetToken: () => "test-token",
		expiryEventType: "session-expired",
		postMessage: postMessageMock,
	});

	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	// One millisecond before the 12h boundary: the session must NOT have expired.
	// Any mutated expiry (undefined/12000/43.2) would already have fired by now.
	mock.timers.tick(43200000 - 1);
	const earlyExpiry = postMessageMock.mock.calls.filter(
		(c) => c.arguments[0]?.type === "session-expired",
	);
	strictEqual(earlyExpiry.length, 0);

	// Crossing the exact boundary fires the expiry event exactly once.
	mock.timers.tick(1);
	const expired = postMessageMock.mock.calls.filter(
		(c) => c.arguments[0]?.type === "session-expired",
	);
	strictEqual(expired.length, 1);

	session.destroy();
	mock.timers.reset();
});

// --- Line 73: swOrigin uses optional chaining on `.location` ---
test("sessionMiddleware: should build (and deny) when self has no location", async (_t) => {
	// `self` is defined but `self.location` is undefined. The real
	// `globalThis.self?.location?.origin` evaluates to undefined, so no allow-list
	// is derived and isAllowedOrigin fails closed. The mutant
	// `globalThis.self?.location.origin` would throw a TypeError reading `.origin`
	// of undefined while constructing the middleware. Asserting the middleware
	// builds AND processes a request proves the optional chain on `.location`.
	const descriptor = Object.getOwnPropertyDescriptor(global, "self");
	Object.defineProperty(global, "self", {
		value: {},
		writable: true,
		configurable: true,
	});

	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 60000,
		postMessage: mock.fn(),
	});
	await authenticateSession(session);

	// With swOrigin undefined and no allow-list, isAllowedOrigin fails closed, so
	// the matching request does NOT receive the token.
	const apiRequest = new Request(`${domain}/api/data`);
	const result = session.before(apiRequest, {}, {});
	strictEqual(result.headers.get("Authorization"), null);
	session.destroy();

	Object.defineProperty(global, "self", descriptor);
});

// --- Line 102: after only tracks caches for authz-matching requests ---
test("sessionMiddleware: after should NOT track cache for non-authz-matching requests", async (_t) => {
	const cachesDeleteMock = mock.fn();
	const origDelete = global.caches.delete;
	global.caches.delete = cachesDeleteMock;

	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 60000,
		postMessage: mock.fn(),
	});
	await authenticateSession(session);

	// after() with a request whose URL does NOT match authzPathPattern: its
	// cacheKey must NOT be tracked. The `if (true)` mutant would track it anyway.
	const publicRequest = new Request(`${domain}/public/page`);
	const publicResponse = new Response("{}", { status: 200 });
	session.after(
		publicRequest,
		publicResponse,
		{},
		{ cacheKey: "sw-untracked-cache" },
	);

	// Logout clears the session and deletes only tracked caches.
	const logoutRequest = new Request(`${domain}/auth/logout`, {
		method: "POST",
	});
	const logoutResponse = new Response("{}", { status: 200 });
	await session.afterNetwork(
		logoutRequest,
		logoutResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	const deletedKeys = cachesDeleteMock.mock.calls.map((c) => c.arguments[0]);
	strictEqual(deletedKeys.includes("sw-untracked-cache"), false);
	strictEqual(cachesDeleteMock.mock.callCount(), 0);

	session.destroy();
	global.caches.delete = origDelete;
});

// --- Line 113: afterNetwork guards authn branch on a present authnPathPattern ---
test("sessionMiddleware: afterNetwork without authnPathPattern should not enter authn branch", async (_t) => {
	// Only unauthnPathPattern is configured, so authnPathPattern is undefined.
	// Real code: `authnPathPattern && ...` short-circuits to the else-if. The
	// `true && authnMethods.includes(...) && authnPathPattern.test(...)` mutant
	// would dereference undefined.test and throw; the `||` mutant would likewise
	// reach authnPathPattern.test on a POST. A request that matches NEITHER
	// pattern must resolve cleanly without extracting a token or clearing.
	const authnGetToken = mock.fn(() => "token");
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken,
		authnGetExpiry: () => 60000,
		postMessage: mock.fn(),
	});

	const request = new Request(`${domain}/auth/login`, { method: "POST" });
	const response = new Response("{}", { status: 200 });
	const result = await session.afterNetwork(
		request,
		response,
		{},
		{ cacheKey: "sw-default" },
	);

	strictEqual(authnGetToken.mock.callCount(), 0);
	strictEqual(result, response);
	session.destroy();
});

// --- Line 113: authn branch requires BOTH pattern match AND allowed method ---
test("sessionMiddleware: afterNetwork should not extract token for disallowed method on authn URL", async (_t) => {
	// authnMethods defaults to ["POST"]. A GET to the login URL matches
	// authnPathPattern but NOT authnMethods. Real `&&` requires both, so the
	// token is not extracted. The `||` mutant (authnPathPattern || method-check)
	// would extract it because authnPathPattern is truthy.
	const authnGetToken = mock.fn(() => "token");
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken,
		authnGetExpiry: () => 60000,
		postMessage: mock.fn(),
	});

	const request = new Request(`${domain}/auth/login`, { method: "GET" });
	const response = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer token" }),
	});
	const result = await session.afterNetwork(
		request,
		response,
		{},
		{ cacheKey: "sw-default" },
	);

	strictEqual(authnGetToken.mock.callCount(), 0);
	// Token never set, so the Authorization header is left untouched (not stripped).
	strictEqual(result.headers.get("Authorization"), "Bearer token");
	session.destroy();
});

// --- Line 125: afterNetwork only clears session for unauthn-matching URLs ---
test("sessionMiddleware: afterNetwork non-matching URL should NOT clear the session", async (_t) => {
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		unauthnPathPattern: /\/auth\/logout/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 60000,
		postMessage: mock.fn(),
	});
	await authenticateSession(session);

	// A response for a URL matching neither authn nor unauthn. Real code leaves
	// the session intact; the `else if (true)` mutant would clearSession here.
	const otherRequest = new Request(`${domain}/other/path`, { method: "POST" });
	const otherResponse = new Response("{}", { status: 200 });
	await session.afterNetwork(
		otherRequest,
		otherResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	// Session must still be live: before still attaches the token.
	const apiRequest = new Request(`${domain}/api/data`);
	const result = session.before(apiRequest, {}, {});
	strictEqual(result.headers.get("Authorization"), "Bearer test-token");
	session.destroy();
});

// --- Line 125: unauthn check uses optional chaining (no unauthnPathPattern) ---
test("sessionMiddleware: afterNetwork without unauthnPathPattern should resolve cleanly", async (_t) => {
	// Only authnPathPattern is configured, so unauthnPathPattern is undefined.
	// A response that does NOT match authnPathPattern reaches the else-if. Real
	// `unauthnPathPattern?.test(...)` evaluates to undefined (no clear); the
	// mutant `unauthnPathPattern.test(...)` would throw on undefined.
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 60000,
		postMessage: mock.fn(),
	});
	await authenticateSession(session);

	const otherRequest = new Request(`${domain}/other/path`, { method: "POST" });
	const otherResponse = new Response("{}", { status: 200 });
	const result = await session.afterNetwork(
		otherRequest,
		otherResponse,
		{},
		{ cacheKey: "sw-default" },
	);
	strictEqual(result, otherResponse);

	// Session is untouched: token still attaches.
	const apiRequest = new Request(`${domain}/api/data`);
	const attached = session.before(apiRequest, {}, {});
	strictEqual(attached.headers.get("Authorization"), "Bearer test-token");
	session.destroy();
});

// --- Line 141: inactivityTimer delay subtracts now() (sign matters when now>0) ---
test("sessionMiddleware: inactivity prompt timing must subtract now() (non-zero clock)", async (_t) => {
	// Start the virtual clock at a NON-zero time so the sign of `now()` in the
	// timeout expression is observable. login at t=100000 with expiry 200000 and
	// the 60000 buffer => real delay = R + E - B - now() = 200000 - 60000 =
	// 140000ms. The `+ now()` mutant computes 2*100000 + 200000 - 60000 =
	// 340000ms, so it would NOT have fired at 140000.
	mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100000 });

	const postMessageMock = mock.fn();
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 200000,
		inactivityPromptEventType: "inactivity-prompt",
		postMessage: postMessageMock,
	});

	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	// Advance to exactly the real delay. The prompt must fire (user is inactive
	// at the boundary). The `+ now()` mutant fires only at 340000, so it stays 0.
	mock.timers.tick(140000);
	const promptCalls = postMessageMock.mock.calls.filter(
		(c) => c.arguments[0]?.type === "inactivity-prompt",
	);
	strictEqual(promptCalls.length, 1);

	session.destroy();
	mock.timers.reset();
});

// --- Line 178: expiryPromptEvent re-arms the inactivityTimer when user is active ---
test("sessionMiddleware: inactivity timer should re-arm and later prompt after activity", async (_t) => {
	// When the inactivity timer fires while the user is still "active", the else
	// branch must re-arm the timer (`inactivityTimer()`); the `else {}` mutant
	// drops it. We observe the re-arm by letting the timer fire once during an
	// active window, then advancing far enough that — with the re-arm — a prompt
	// eventually fires; without it, no prompt ever fires.
	mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });

	const postMessageMock = mock.fn();
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 120000,
		inactivityPromptEventType: "inactivity-prompt",
		postMessage: postMessageMock,
	});

	const loginRequest = new Request(`${domain}/auth/login`, { method: "POST" });
	const loginResponse = new Response("{}", {
		status: 200,
		headers: new Headers({ Authorization: "Bearer test-token" }),
	});
	await session.afterNetwork(
		loginRequest,
		loginResponse,
		{},
		{ cacheKey: "sw-default" },
	);

	// Initial timer fires at R + 120000 - 60000 - now() = 60000ms. Stay active
	// just before it fires so the firing hits the else (re-arm) branch.
	mock.timers.tick(59000);
	session.activityEvent(); // recentActivityTimestamp = 59000
	// Cross the original boundary: timer fires at 60000, user is still "active"
	// (recentActivityTimestamp 59000 > now() - 120000 + 60000 = 0), so it re-arms
	// instead of prompting.
	mock.timers.tick(1000);
	let promptCalls = postMessageMock.mock.calls.filter(
		(c) => c.arguments[0]?.type === "inactivity-prompt",
	);
	strictEqual(promptCalls.length, 0);

	// No further activity. With the re-arm in place the timer will eventually fire
	// again once the user is inactive and post the prompt. Without the re-arm
	// (mutant), no prompt is ever delivered.
	mock.timers.tick(120000);
	promptCalls = postMessageMock.mock.calls.filter(
		(c) => c.arguments[0]?.type === "inactivity-prompt",
	);
	strictEqual(promptCalls.length, 1);

	session.destroy();
	mock.timers.reset();
});
