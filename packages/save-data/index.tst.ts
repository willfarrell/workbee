/// <reference lib="webworker" />

import type { BeforeMiddleware, Strategy } from "@work-bee/core";
import saveData from "@work-bee/save-data";
import { describe, expect, test } from "tstyche";

describe("save-data", () => {
	test("returns SaveDataMiddlewareResult", () => {
		const result = saveData({});
		expect(result).type.toBe<{ before: BeforeMiddleware }>();
	});

	test("before is BeforeMiddleware", () => {
		const result = saveData({});
		expect(result.before).type.toBe<BeforeMiddleware>();
	});

	test("accepts saveDataStrategy option", () => {
		saveData({ saveDataStrategy: {} as Strategy });
	});
});
