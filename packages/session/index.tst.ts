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
		expect(result).type.toBe<{
			before?: BeforeMiddleware;
			afterNetwork?: AfterMiddleware;
			after?: AfterMiddleware;
			activityEvent: () => void;
		}>();
	});

	test("activityEvent returns void", () => {
		const result = session({});
		expect(result.activityEvent()).type.toBe<void>();
	});

	test("requires opts parameter", () => {
		expect(session).type.not.toBeCallableWith();
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
		expect(getTokenAuthorization({} as Response)).type.toBe<string>();
	});

	test("getExpiryJWT returns number", () => {
		expect(getExpiryJWT({} as Response, "token")).type.toBe<number>();
	});

	test("getExpiryPaseto returns number", () => {
		expect(getExpiryPaseto({} as Response, "token")).type.toBe<number>();
	});

	test("setTokenAuthorization returns Request", () => {
		expect(setTokenAuthorization({} as Request, "token")).type.toBe<Request>();
	});
});
