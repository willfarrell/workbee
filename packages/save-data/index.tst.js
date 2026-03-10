// Copyright (c) willfarrell. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

/// <reference lib="webworker" />

import saveData from "@work-bee/save-data";
import { describe, expect, test } from "tstyche";

/** @typedef {import("@work-bee/core").BeforeMiddleware} BeforeMiddleware */

describe("save-data", () => {
	test("returns SaveDataMiddlewareResult", () => {
		const result = saveData({});
		expect(result).type.toBe(
			/** @type {{ before: BeforeMiddleware }} */ (
				/** @type {unknown} */ (undefined)
			),
		);
	});

	test("before is BeforeMiddleware", () => {
		const result = saveData({});
		expect(result.before).type.toBe(
			/** @type {BeforeMiddleware} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("accepts saveDataStrategy option", () => {
		saveData({
			saveDataStrategy: /** @type {import("@work-bee/core").Strategy} */ (
				/** @type {unknown} */ (undefined)
			),
		});
	});
});
