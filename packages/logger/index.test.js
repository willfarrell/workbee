/* global Request */

import { deepEqual, equal } from "node:assert";
import { mock, test } from "node:test";
import { domain, setupMocks } from "../../test-unit/helper.js";
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
	equal(redactHeaders.includes("authorization"), true);
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
