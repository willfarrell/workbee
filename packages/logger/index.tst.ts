/// <reference lib="webworker" />

import type { AfterMiddleware, BeforeMiddleware } from "@work-bee/core";
import logger from "@work-bee/logger";
import { describe, expect, test } from "tstyche";

describe("logger", () => {
	test("returns LoggerMiddlewareResult with defaults", () => {
		const result = logger();
		expect(result).type.toBe(
			undefined as unknown as {
				before: BeforeMiddleware | false;
				beforeNetwork: BeforeMiddleware | false;
				afterNetwork: AfterMiddleware | false;
				after: AfterMiddleware | false;
			},
		);
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
		expect(result.before).type.toBe(
			undefined as unknown as BeforeMiddleware | false,
		);
	});
});
