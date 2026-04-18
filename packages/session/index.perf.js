/* global Request Response Headers */
import { test } from "node:test";
import "../../fixtures/helper.js";
import { domain } from "../../fixtures/helper.js";
import sessionMiddleware, {
	getExpiryJWT,
	getExpiryPaseto,
	getTokenAuthorization,
	setTokenAuthorization,
} from "./index.js";

test("perf: getTokenAuthorization", async () => {
	const iterations = 100_000;
	const response = new Response("", {
		headers: new Headers({ Authorization: "Bearer test-token-abc" }),
	});
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		getTokenAuthorization(response);
	}
	const duration = performance.now() - start;
	console.log(
		`getTokenAuthorization: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: setTokenAuthorization", async () => {
	const iterations = 100_000;
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		setTokenAuthorization(new Request(`${domain}/api/data`), "my-token-123");
	}
	const duration = performance.now() - start;
	console.log(
		`setTokenAuthorization: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: getExpiryJWT", async () => {
	const iterations = 100_000;
	const exp = Math.floor(Date.now() / 1000) + 3600;
	const header = btoa(JSON.stringify({ alg: "HS256" }));
	const payload = btoa(JSON.stringify({ exp }));
	const token = `${header}.${payload}.fake-signature`;
	const response = new Response("");
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		getExpiryJWT(response, token);
	}
	const duration = performance.now() - start;
	console.log(
		`getExpiryJWT: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: getExpiryPaseto", async () => {
	const iterations = 100_000;
	const exp = new Date(Date.now() + 7200 * 1000).toISOString();
	const footer = btoa(JSON.stringify({ exp }));
	const token = `v4.public.${footer}`;
	const response = new Response("");
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		getExpiryPaseto(response, token);
	}
	const duration = performance.now() - start;
	console.log(
		`getExpiryPaseto: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: sessionMiddleware before + after (authenticated)", async () => {
	const iterations = 100_000;
	const session = sessionMiddleware({
		authzPathPattern: /\/api\//,
		authnPathPattern: /\/auth\/login/,
		authnGetToken: () => "test-token",
		authnGetExpiry: () => 60000,
		postMessage: () => {},
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
		{
			cacheKey: "sw-default",
		},
	);

	const request = new Request(`${domain}/api/data`);
	const response = new Response("{}", { status: 200 });
	const event = {};
	const config = { cacheKey: "sw-api" };
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		session.before(new Request(`${domain}/api/data`), event, config);
		session.after(request, response, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`sessionMiddleware before+after (authed): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
	session.destroy();
});
