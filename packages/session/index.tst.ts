/// <reference lib="webworker" />

import session, {
	getExpiryJWT,
	getExpiryPaseto,
	getTokenAuthorization,
	setTokenAuthorization,
} from "@work-bee/session";
import { describe, expect, test } from "tstyche";

/** @typedef {import("@work-bee/core").BeforeMiddleware} BeforeMiddleware */
/** @typedef {import("@work-bee/core").AfterMiddleware} AfterMiddleware */

describe("session", () => {
	test("returns SessionMiddlewareResult", () => {
		const result = session({});
		expect(result).type.toBe(
			/** @type {{ before?: BeforeMiddleware; afterNetwork?: AfterMiddleware; after?: AfterMiddleware; activityEvent: () => void }} */ (
				/** @type {unknown} */ (undefined)
			),
		);
	});

	test("activityEvent returns void", () => {
		const result = session({});
		expect(result.activityEvent()).type.toBe(
			/** @type {void} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("requires opts parameter", () => {
		// @ts-expect-error Expected 1 arguments, but got 0.
		session();
	});

	test("accepts all options", () => {
		session({
			authnMethods: ["POST"],
			authnPathPattern: /\/login/,
			authnGetToken: (_response) => "token",
			authnGetExpiry: (_response, _token) => 3600,
			authzPathPattern: /\/api/,
			authzSetToken: (request, _token) => request,
			inactivityPromptEventType: "inactivity-prompt",
			unauthnPathPattern: /\/logout/,
			expiryEventType: "session-expired",
		});
	});

	test("getTokenAuthorization returns string", () => {
		expect(
			getTokenAuthorization(
				/** @type {Response} */ (/** @type {unknown} */ ({})),
			),
		).type.toBe(/** @type {string} */ (/** @type {unknown} */ (undefined)));
	});

	test("getExpiryJWT returns number", () => {
		expect(
			getExpiryJWT(
				/** @type {Response} */ (/** @type {unknown} */ ({})),
				"token",
			),
		).type.toBe(/** @type {number} */ (/** @type {unknown} */ (undefined)));
	});

	test("getExpiryPaseto returns number", () => {
		expect(
			getExpiryPaseto(
				/** @type {Response} */ (/** @type {unknown} */ ({})),
				"token",
			),
		).type.toBe(/** @type {number} */ (/** @type {unknown} */ (undefined)));
	});

	test("setTokenAuthorization returns Request", () => {
		expect(
			setTokenAuthorization(
				/** @type {Request} */ (/** @type {unknown} */ ({})),
				"token",
			),
		).type.toBe(/** @type {Request} */ (/** @type {unknown} */ (undefined)));
	});
});
