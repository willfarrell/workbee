/// <reference lib="webworker" />

import type { AfterMiddleware, BeforeMiddleware } from "@work-bee/core";
import { compileConfig } from "@work-bee/core";
import inactivity from "@work-bee/inactivity";
import inactivityClient from "@work-bee/inactivity/client";
import { describe, expect, test } from "tstyche";

describe("inactivity", () => {
	test("returns InactivityMiddlewareResult", () => {
		const result = inactivity();
		expect(result).type.toBe<{
			before: BeforeMiddleware;
			after: AfterMiddleware;
		}>();
	});

	test("accepts a postMessage option", () => {
		inactivity({ postMessage: async (_message) => {} });
	});

	test("rejects the removed timer options", () => {
		expect(inactivity).type.not.toBeCallableWith({
			inactivityAllowedInMin: 30,
		});
	});

	test("is usable as a middleware", () => {
		compileConfig({ middlewares: [inactivity()] });
	});

	test("inactivityClient accepts all options and returns cleanup", () => {
		expect(
			inactivityClient({
				inactivityAllowedInMin: 30,
				inactivityEvent: () => {},
				events: ["click", "keydown"],
			}),
		).type.toBe<() => void>();
	});

	test("inactivityClient accepts no arguments and returns cleanup", () => {
		expect(inactivityClient()).type.toBe<() => void>();
	});

	test("inactivityClient no longer takes an events array", () => {
		expect(inactivityClient).type.not.toBeCallableWith(["click"]);
	});
});
