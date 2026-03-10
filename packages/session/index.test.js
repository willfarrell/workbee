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
	const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
	const header = btoa(JSON.stringify({ alg: "HS256" }));
	const payload = btoa(JSON.stringify({ expires_at: expiresAt }));
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

test("sessionMiddleware: before should set empty Bearer token when sessionToken is empty", async (_t) => {
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		postMessage: mock.fn(),
	});

	// No authentication happened, sessionToken is empty
	const apiRequest = new Request(`${domain}/api/data`);
	const result = session.before(apiRequest, {}, {});
	strictEqual(result.headers.get("Authorization"), "Bearer");
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

	// After clearSession, before should set empty Bearer token (sessionToken is "")
	const newApiRequest = new Request(`${domain}/api/data`);
	const result = session.before(newApiRequest, {}, {});
	strictEqual(result.headers.get("Authorization"), "Bearer");
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
