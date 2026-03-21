/// <reference lib="webworker" />

import type { AfterMiddleware } from "@work-bee/core";
import type { SerializedRequest } from "@work-bee/offline";
import offline, {
	idbDeserializeRequest,
	idbSerializeRequest,
} from "@work-bee/offline";
import { describe, expect, test } from "tstyche";

describe("offline", () => {
	test("returns OfflineMiddlewareResult", () => {
		const result = offline();
		expect(result).type.toBe<{
			afterNetwork: AfterMiddleware;
			postMessageEvent: () => Promise<void>;
			destroy: () => void;
		}>();
	});

	test("afterNetwork is AfterMiddleware", () => {
		const result = offline();
		expect(result.afterNetwork).type.toBe<AfterMiddleware>();
	});

	test("postMessageEvent returns Promise<void>", () => {
		const result = offline();
		expect(result.postMessageEvent()).type.toBe<Promise<void>>();
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
		expect(idbSerializeRequest({} as Request)).type.toBe<
			Promise<SerializedRequest>
		>();
	});

	test("idbDeserializeRequest returns Request", () => {
		expect(idbDeserializeRequest({} as SerializedRequest)).type.toBe<Request>();
	});
});
