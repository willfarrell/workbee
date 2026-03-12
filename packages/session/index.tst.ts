/// <reference lib="webworker" />

import type { AfterMiddleware, BeforeMiddleware } from "@work-bee/core";
import session, {
	getExpiryJWT,
	getExpiryPaseto,
	getTokenAuthorization,
	setTokenAuthorization,
} from "@work-bee/session";
import { describe, expect, test } from "tstyche";

describe("session", () => {
	test("returns SessionMiddlewareResult", () => {
		const result = session({});
		expect(result).type.toBe(
			undefined as unknown as {
				before?: BeforeMiddleware;
				afterNetwork?: AfterMiddleware;
				after?: AfterMiddleware;
				activityEvent: () => void;
			},
		);
	});

	test("activityEvent returns void", () => {
		const result = session({});
		expect(result.activityEvent()).type.toBe(undefined as unknown as undefined);
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
		expect(getTokenAuthorization({} as unknown as Response)).type.toBe(
			undefined as unknown as string,
		);
	});

	test("getExpiryJWT returns number", () => {
		expect(getExpiryJWT({} as unknown as Response, "token")).type.toBe(
			undefined as unknown as number,
		);
	});

	test("getExpiryPaseto returns number", () => {
		expect(getExpiryPaseto({} as unknown as Response, "token")).type.toBe(
			undefined as unknown as number,
		);
	});

	test("setTokenAuthorization returns Request", () => {
		expect(setTokenAuthorization({} as unknown as Request, "token")).type.toBe(
			undefined as unknown as Request,
		);
	});
});
