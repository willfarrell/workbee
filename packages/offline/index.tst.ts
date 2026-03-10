/// <reference lib="webworker" />

import offline, {
	idbDeserializeRequest,
	idbSerializeRequest,
} from "@work-bee/offline";
import { describe, expect, test } from "tstyche";

/** @typedef {import("@work-bee/core").AfterMiddleware} AfterMiddleware */
/** @typedef {import("@work-bee/offline").SerializedRequest} SerializedRequest */

describe("offline", () => {
	test("returns OfflineMiddlewareResult", () => {
		const result = offline();
		expect(result).type.toBe(
			/** @type {{ afterNetwork: AfterMiddleware; postMessageEvent: () => Promise<void> }} */ (
				/** @type {unknown} */ (undefined)
			),
		);
	});

	test("afterNetwork is AfterMiddleware", () => {
		const result = offline();
		expect(result.afterNetwork).type.toBe(
			/** @type {AfterMiddleware} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("postMessageEvent returns Promise<void>", () => {
		const result = offline();
		expect(result.postMessageEvent()).type.toBe(
			/** @type {Promise<void>} */ (/** @type {unknown} */ (undefined)),
		);
	});

	test("accepts all options", () => {
		offline({
			methods: ["POST"],
			statusCodes: [503],
			pollDelay: 5000,
			enqueueEventType: "enqueue",
			quotaExceededEventType: "quota",
			dequeueEventType: "dequeue",
			objectStoreName: "requests",
		});
	});

	test("idbSerializeRequest returns Promise<SerializedRequest>", () => {
		expect(
			idbSerializeRequest(/** @type {Request} */ (/** @type {unknown} */ ({}))),
		).type.toBe(
			/** @type {Promise<SerializedRequest>} */ (
				/** @type {unknown} */ (undefined)
			),
		);
	});

	test("idbDeserializeRequest returns Request", () => {
		expect(
			idbDeserializeRequest(
				/** @type {SerializedRequest} */ (/** @type {unknown} */ ({})),
			),
		).type.toBe(/** @type {Request} */ (/** @type {unknown} */ (undefined)));
	});
});
