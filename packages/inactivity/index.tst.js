// Copyright (c) willfarrell. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

/// <reference lib="webworker" />

import inactivity from "@work-bee/inactivity";
import inactivityClient from "@work-bee/inactivity/client";
import { describe, expect, test } from "tstyche";

/** @typedef {import("@work-bee/core").BeforeMiddleware} BeforeMiddleware */
/** @typedef {import("@work-bee/core").AfterMiddleware} AfterMiddleware */

describe("inactivity", () => {
	test("returns InactivityMiddlewareResult", () => {
		const result = inactivity();
		expect(result).type.toBe(
			/** @type {{ before: BeforeMiddleware; after: AfterMiddleware; postMessageEvent: () => void }} */ (
				/** @type {unknown} */ (undefined)
			),
		);
	});

	test("before is BeforeMiddleware", () => {
		const result = inactivity();
		expect(result.before).type.toBe(
			/** @type {BeforeMiddleware} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("after is AfterMiddleware", () => {
		const result = inactivity();
		expect(result.after).type.toBe(
			/** @type {AfterMiddleware} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("postMessageEvent returns void", () => {
		const result = inactivity();
		expect(result.postMessageEvent()).type.toBe(
			/** @type {void} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("accepts all options", () => {
		inactivity({
			inactivityAllowedInMin: 30,
			inactivityEvent: () => {},
		});
	});

	test("inactivityClient accepts events array", () => {
		expect(inactivityClient(["click", "keydown"])).type.toBe(
			/** @type {void} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("inactivityClient accepts no arguments", () => {
		expect(inactivityClient()).type.toBe(
			/** @type {void} */ (/** @type {unknown} */ (undefined)),
		);
	});
});
