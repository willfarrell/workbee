/// <reference lib="webworker" />

import type { AfterMiddleware, BeforeMiddleware } from "@work-bee/core";
import inactivity from "@work-bee/inactivity";
import inactivityClient from "@work-bee/inactivity/client";
import { describe, expect, test } from "tstyche";

describe("inactivity", () => {
	test("returns InactivityMiddlewareResult", () => {
		const result = inactivity();
		expect(result).type.toBe(
			undefined as unknown as {
				before: BeforeMiddleware;
				after: AfterMiddleware;
				postMessageEvent: () => void;
			},
		);
	});

	test("before is BeforeMiddleware", () => {
		const result = inactivity();
		expect(result.before).type.toBe(undefined as unknown as BeforeMiddleware);
	});

	test("after is AfterMiddleware", () => {
		const result = inactivity();
		expect(result.after).type.toBe(undefined as unknown as AfterMiddleware);
	});

	test("postMessageEvent returns void", () => {
		const result = inactivity();
		expect(result.postMessageEvent()).type.toBe<void>();
	});

	test("accepts all options", () => {
		inactivity({
			inactivityAllowedInMin: 30,
			inactivityEvent: () => {},
		});
	});

	test("inactivityClient accepts events array", () => {
		expect(inactivityClient(["click", "keydown"])).type.toBe<void>();
	});

	test("inactivityClient accepts no arguments", () => {
		expect(inactivityClient()).type.toBe<void>();
	});
});
