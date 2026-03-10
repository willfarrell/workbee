/// <reference lib="webworker" />

import logger from "@work-bee/logger";
import { describe, expect, test } from "tstyche";

/** @typedef {import("@work-bee/core").BeforeMiddleware} BeforeMiddleware */
/** @typedef {import("@work-bee/core").AfterMiddleware} AfterMiddleware */

describe("logger", () => {
	test("returns LoggerMiddlewareResult with defaults", () => {
		const result = logger();
		expect(result).type.toBe(
			/** @type {{ before: BeforeMiddleware | false; beforeNetwork: BeforeMiddleware | false; afterNetwork: AfterMiddleware | false; after: AfterMiddleware | false }} */ (
				/** @type {unknown} */ (undefined)
			),
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
			/** @type {BeforeMiddleware | false} */ (
				/** @type {unknown} */ (undefined)
			),
		);
	});
});
