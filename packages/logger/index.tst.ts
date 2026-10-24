/// <reference lib="webworker" />

import type { AfterMiddleware, BeforeMiddleware } from "@work-bee/core";
import { compileConfig } from "@work-bee/core";
import logger from "@work-bee/logger";
import { describe, expect, test } from "tstyche";

describe("logger", () => {
	test("returns LoggerMiddlewareResult with defaults", () => {
		const result = logger();
		expect(result).type.toBe<{
			before: BeforeMiddleware | false;
			beforeNetwork: BeforeMiddleware | false;
			afterNetwork: AfterMiddleware | false;
			after: AfterMiddleware | false;
		}>();
	});

	test("accepts all options", () => {
		const result = logger({
			logger: (
				_when,
				_request,
				_response,
				_event,
				_config,
				_redactHeaders,
			) => {},
			redactHeaders: ["Authorization"],
			runOnBefore: true,
			runOnBeforeNetwork: false,
			runOnAfterNetwork: true,
			runOnAfter: false,
		});
		expect(result.before).type.toBe<BeforeMiddleware | false>();
	});

	test("is usable as a middleware in compileConfig", () => {
		expect(compileConfig).type.toBeCallableWith({
			middlewares: [logger()],
		});
		expect(compileConfig).type.toBeCallableWith({
			routes: [{ path: "/", middlewares: [logger({ runOnBefore: false })] }],
		});
	});

	test("custom logger receives the response or error the hook saw", () => {
		logger({
			logger: (_when, _request, response) => {
				expect(response).type.toBe<Response | Error | undefined>();
			},
		});
	});
});
