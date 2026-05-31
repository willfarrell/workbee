/* global Request */

import { deepEqual, equal } from "node:assert";
import { mock, test } from "node:test";
import { domain, setupMocks } from "../../fixtures/helper.js";
import loggerMiddleware from "./index.js";

test("loggerMiddleware: Should trigger logger by default", async (_t) => {
	const request = new Request(`${domain}/200`, { method: "GET" });
	const response = await fetch(request);

	const loggerSpy = mock.fn();
	const logger = loggerMiddleware({ logger: loggerSpy });
	const { event, config } = setupMocks(undefined, `${domain}/200`);
	const outputRequest = await logger.before(request, event, config);
	const outputResponse = await logger.after(request, response, event, config);

	deepEqual(outputRequest, request);
	deepEqual(outputResponse, response);
	equal(loggerSpy.mock.callCount(), 2);
});

test("loggerMiddleware.before: Should trigger before", async (_t) => {
	const request = new Request(`${domain}/200`, { method: "GET" });

	const loggerSpy = mock.fn();
	const logger = loggerMiddleware({
		logger: loggerSpy,
		runOnBefore: true,
	});
	const { event, config } = setupMocks(undefined, `${domain}/200`);
	const outputRequest = await logger.before(request, event, config);

	deepEqual(outputRequest, request);
	equal(loggerSpy.mock.callCount(), 1);
});

test("loggerMiddleware.beforeNetwork: Should trigger beforeNetwork", async (_t) => {
	const request = new Request(`${domain}/200`, { method: "GET" });

	const loggerSpy = mock.fn();
	const logger = loggerMiddleware({
		logger: loggerSpy,
		runOnBeforeNetwork: true,
	});
	const { event, config } = setupMocks(undefined, `${domain}/200`);
	const outputRequest = await logger.beforeNetwork(request, event, config);

	deepEqual(outputRequest, request);
	equal(loggerSpy.mock.callCount(), 1);
	// The `when` label (first logger arg) must be "beforeNetwork".
	equal(loggerSpy.mock.calls[0].arguments[0], "beforeNetwork");
});

test("loggerMiddleware.afterNetwork: Should trigger afterNetwork", async (_t) => {
	const request = new Request(`${domain}/200`, { method: "GET" });
	const response = await fetch(request);

	const loggerSpy = mock.fn();
	const logger = loggerMiddleware({
		logger: loggerSpy,
		runOnAfterNetwork: true,
	});
	const { event, config } = setupMocks(undefined, `${domain}/200`);
	const outputResponse = await logger.afterNetwork(
		request,
		response,
		event,
		config,
	);

	deepEqual(outputResponse, response);
	equal(loggerSpy.mock.callCount(), 1);
	// The `when` label (first logger arg) must be "afterNetwork".
	equal(loggerSpy.mock.calls[0].arguments[0], "afterNetwork");
});

test("loggerMiddleware.after: Should trigger after", async (_t) => {
	const request = new Request(`${domain}/200`, { method: "GET" });
	const response = await fetch(request);

	const loggerSpy = mock.fn();
	const logger = loggerMiddleware({
		logger: loggerSpy,
		runOnAfter: true,
	});
	const { event, config } = setupMocks(undefined, `${domain}/200`);
	const outputResponse = await logger.after(request, response, event, config);

	deepEqual(outputResponse, response);
	equal(loggerSpy.mock.callCount(), 1);
	// The `when` label (first logger arg) must be "after".
	equal(loggerSpy.mock.calls[0].arguments[0], "after");
});

test("loggerMiddleware: Should redact sensitive headers by default", async (_t) => {
	const request = new Request(`${domain}/200`, {
		method: "GET",
		headers: {
			Authorization: "Bearer secret-token",
			"Content-Type": "application/json",
		},
	});

	const loggerSpy = mock.fn();
	const logger = loggerMiddleware({
		logger: loggerSpy,
		runOnBefore: true,
	});
	const { event, config } = setupMocks(undefined, `${domain}/200`);
	await logger.before(request, event, config);

	equal(loggerSpy.mock.callCount(), 1);
	const [when, _req, _response, _evt, _cfg, redactHeaders] =
		loggerSpy.mock.calls[0].arguments;
	equal(when, "before");
	// The default redact list must contain every sensitive header verbatim;
	// a deep compare pins each literal so dropping any (e.g. "set-cookie" or
	// "proxy-authorization") is caught.
	deepEqual(redactHeaders, [
		"authorization",
		"cookie",
		"set-cookie",
		"proxy-authorization",
	]);
});

test("loggerMiddleware: Should allow disabling header redaction", async (_t) => {
	const request = new Request(`${domain}/200`, {
		method: "GET",
		headers: {
			Authorization: "Bearer secret-token",
		},
	});

	const loggerSpy = mock.fn();
	const logger = loggerMiddleware({
		logger: loggerSpy,
		redactHeaders: [],
		runOnBefore: true,
	});
	const { event, config } = setupMocks(undefined, `${domain}/200`);
	await logger.before(request, event, config);

	equal(loggerSpy.mock.callCount(), 1);
	const [_when, _req, _response, _evt, _cfg, redactHeaders] =
		loggerSpy.mock.calls[0].arguments;
	deepEqual(redactHeaders, []);
});

test("loggerMiddleware: Should redact custom headers", async (_t) => {
	const request = new Request(`${domain}/200`, {
		method: "GET",
		headers: {
			"X-Custom-Secret": "my-secret",
			"Content-Type": "application/json",
		},
	});

	const loggerSpy = mock.fn();
	const logger = loggerMiddleware({
		logger: loggerSpy,
		redactHeaders: ["x-custom-secret"],
		runOnBefore: true,
	});
	const { event, config } = setupMocks(undefined, `${domain}/200`);
	await logger.before(request, event, config);

	equal(loggerSpy.mock.callCount(), 1);
	const [_when, _req, _response, _evt, _cfg, redactHeaders] =
		loggerSpy.mock.calls[0].arguments;
	equal(redactHeaders.includes("x-custom-secret"), true);
});

test("loggerMiddleware: Should pass through headers when redactHeaders is undefined", async (_t) => {
	const request = new Request(`${domain}/200`, {
		method: "GET",
		headers: {
			Authorization: "Bearer secret-token",
		},
	});

	const loggerSpy = mock.fn();
	const logger = loggerMiddleware({
		logger: loggerSpy,
		redactHeaders: undefined,
		runOnBefore: true,
	});
	const { event, config } = setupMocks(undefined, `${domain}/200`);
	await logger.before(request, event, config);

	equal(loggerSpy.mock.callCount(), 1);
	const [_when, _req, _response, _evt, _cfg, redactHeaders] =
		loggerSpy.mock.calls[0].arguments;
	equal(redactHeaders, undefined);
});

test("loggerMiddleware: Should not redact non-matching header keys", async (t) => {
	const logMock = t.mock.method(console, "log", () => {});
	const request = new Request(`${domain}/200`, {
		method: "GET",
		headers: {
			Authorization: "Bearer secret-token",
			"Content-Type": "application/json",
			"X-Safe": "visible",
		},
	});

	// Use the default logger so redactHeaderValues actually runs and the
	// per-key match decides what gets redacted.
	const logger = loggerMiddleware({ runOnBefore: true });
	const { event, config } = setupMocks(undefined, `${domain}/200`);
	await logger.before(request, event, config);

	equal(logMock.mock.callCount(), 1);
	const detail = logMock.mock.calls[0].arguments[3];
	// Only the matching key is redacted; non-matching keys keep their values.
	// If the per-key `includes` check were bypassed (redact everything), these
	// would be "[REDACTED]" too.
	equal(detail.requestHeaders.authorization, "[REDACTED]");
	equal(detail.requestHeaders["content-type"], "application/json");
	equal(detail.requestHeaders["x-safe"], "visible");
});

test("loggerMiddleware: Should disable before when runOnBefore is false", async (_t) => {
	const logger = loggerMiddleware({
		runOnBefore: false,
	});
	equal(logger.before, false);
});

test("loggerMiddleware: Should disable beforeNetwork when runOnBeforeNetwork is false", async (_t) => {
	const logger = loggerMiddleware({
		runOnBeforeNetwork: false,
	});
	equal(logger.beforeNetwork, false);
});

test("loggerMiddleware: Should disable afterNetwork when runOnAfterNetwork is false", async (_t) => {
	const logger = loggerMiddleware({
		runOnAfterNetwork: false,
	});
	equal(logger.afterNetwork, false);
});

test("loggerMiddleware: Should disable after when runOnAfter is false", async (_t) => {
	const logger = loggerMiddleware({
		runOnAfter: false,
	});
	equal(logger.after, false);
});

test("loggerMiddleware: Should return all hooks when using defaults", async (_t) => {
	const logger = loggerMiddleware();
	equal(typeof logger.before, "function");
	equal(typeof logger.beforeNetwork, "function");
	equal(typeof logger.afterNetwork, "function");
	equal(typeof logger.after, "function");
});

test("loggerMiddleware: Default logger should exercise redactHeaderValues and consoleLog", async (t) => {
	t.mock.method(console, "log", () => {});
	const request = new Request(`${domain}/200`, {
		method: "GET",
		headers: {
			Authorization: "Bearer secret",
			Cookie: "session=abc",
			"Content-Type": "application/json",
		},
	});
	const response = await fetch(request);

	const logger = loggerMiddleware();
	const { event, config } = setupMocks(undefined, `${domain}/200`);

	// before: covers default logger with response=undefined (line 31 responseHeaders branch)
	const outputRequest = await logger.before(request, event, config);
	deepEqual(outputRequest, request);

	// after: covers default logger with actual response
	const outputResponse = await logger.after(request, response, event, config);
	deepEqual(outputResponse, response);
});

test("loggerMiddleware: Default logger falls back to 'custom' when strategy has no name", async (t) => {
	const logMock = t.mock.method(console, "log", () => {});
	const request = new Request(`${domain}/200`, { method: "GET" });
	const logger = loggerMiddleware();
	const { event, config } = setupMocks(undefined, `${domain}/200`);
	// Anonymous strategy — a real example is what strategyStatic() returns.
	config.strategy = (
		() => async () =>
			new Response("")
	)();

	await logger.before(request, event, config);

	equal(logMock.mock.callCount(), 1);
	const [, , strategyName] = logMock.mock.calls[0].arguments;
	equal(strategyName, "custom");
});

test("loggerMiddleware: Default logger tolerates a missing strategy without throwing", async (t) => {
	const logMock = t.mock.method(console, "log", () => {});
	const request = new Request(`${domain}/200`, { method: "GET" });
	const logger = loggerMiddleware();
	const { event, config } = setupMocks(undefined, `${domain}/200`);
	// No strategy at all — the optional chaining on `config.strategy?.name`
	// must guard both the positional arg (line 27) and the `strategy` detail
	// field (line 40). Without `?.` this would throw a TypeError.
	config.strategy = undefined;

	await logger.before(request, event, config);

	equal(logMock.mock.callCount(), 1);
	const [, , strategyName, detail] = logMock.mock.calls[0].arguments;
	// Positional strategy name falls back to "custom" (line 27).
	equal(strategyName, "custom");
	// The `strategy` detail field stays undefined rather than throwing (line 40).
	equal(detail.strategy, undefined);
});

test("loggerMiddleware: Default logger must never leak unredacted secrets to the console", async (t) => {
	const logged = [];
	t.mock.method(console, "log", (...args) => {
		logged.push(args);
	});
	const authSecret = "Bearer super-secret-token";
	const cookieSecret = "session=top-secret";
	const request = new Request(`${domain}/200`, {
		method: "GET",
		headers: {
			Authorization: authSecret,
			Cookie: cookieSecret,
			"Content-Type": "application/json",
		},
	});
	const response = await fetch(request);

	const logger = loggerMiddleware();
	const { event, config } = setupMocks(undefined, `${domain}/200`);

	await logger.before(request, event, config);
	await logger.after(request, response, event, config);

	equal(logged.length, 2);

	// Deeply walk every logged argument, collecting whether any raw
	// Request/Response was passed through and every primitive string value
	// (which is where a leaked secret would surface — e.g. a live Request's
	// headers, or a header value string).
	const walk = (value, seen, out) => {
		if (value === null || value === undefined) return;
		if (value instanceof Request) out.rawRequest = true;
		if (value instanceof Response) out.rawResponse = true;
		if (typeof value === "string") {
			out.strings.push(value);
			return;
		}
		if (typeof value !== "object") return;
		if (seen.has(value)) return;
		seen.add(value);
		// Include Headers entries so a live Request/Response's headers are read.
		if (typeof value.entries === "function" && !Array.isArray(value)) {
			for (const [k, v] of value.entries()) {
				walk(k, seen, out);
				walk(v, seen, out);
			}
		}
		for (const key of Object.keys(value)) {
			walk(value[key], seen, out);
		}
	};

	for (const args of logged) {
		const out = { rawRequest: false, rawResponse: false, strings: [] };
		walk(args, new WeakSet(), out);
		// Raw Request/Response objects must never be passed through — their
		// .headers still carry the unredacted secrets.
		equal(out.rawRequest, false, "raw Request must not be logged");
		equal(out.rawResponse, false, "raw Response must not be logged");
		// No unredacted secret value may appear anywhere in the logged args.
		equal(
			out.strings.includes(authSecret),
			false,
			"Authorization secret leaked",
		);
		equal(out.strings.includes(cookieSecret), false, "Cookie secret leaked");
		equal(out.strings.includes("[REDACTED]"), true, "headers were redacted");
	}
});

test("loggerMiddleware: Default logger with no redactHeaders should skip redaction", async (t) => {
	t.mock.method(console, "log", () => {});
	const request = new Request(`${domain}/200`, {
		method: "GET",
		headers: {
			Authorization: "Bearer secret",
		},
	});
	const response = await fetch(request);

	const logger = loggerMiddleware({ redactHeaders: undefined });
	const { event, config } = setupMocks(undefined, `${domain}/200`);
	await logger.before(request, event, config);
	await logger.after(request, response, event, config);
});
