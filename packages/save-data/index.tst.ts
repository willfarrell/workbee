/// <reference lib="webworker" />

import type {
	AfterMiddleware,
	BeforeMiddleware,
	Strategy,
} from "@work-bee/core";
import saveData from "@work-bee/save-data";
import { describe, expect, test } from "tstyche";

describe("save-data", () => {
	test("returns SaveDataMiddlewareResult", () => {
		const result = saveData({});
		expect(result).type.toBe(
			undefined as unknown as {
				before: BeforeMiddleware;
				after: AfterMiddleware;
			},
		);
	});

	test("before is BeforeMiddleware", () => {
		const result = saveData({});
		expect(result.before).type.toBe(undefined as unknown as BeforeMiddleware);
	});

	test("after is AfterMiddleware", () => {
		const result = saveData({});
		expect(result.after).type.toBe(undefined as unknown as AfterMiddleware);
	});

	test("accepts saveDataStrategy option", () => {
		saveData({
			saveDataStrategy: undefined as unknown as Strategy,
		});
	});
});
