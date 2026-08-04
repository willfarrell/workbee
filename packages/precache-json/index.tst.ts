/// <reference lib="webworker" />

import precacheExtractJSONDefault, {
	precacheExtractJSON,
} from "@work-bee/precache-json";
import { describe, expect, test } from "tstyche";

describe("precache-json", () => {
	test("precacheExtractJSON takes a Response and resolves an array", () => {
		expect(precacheExtractJSON).type.toBeCallableWith(new Response("[]"));
		expect(precacheExtractJSON(new Response("[]"))).type.toBe<Promise<any[]>>();
	});

	test("requires a response argument", () => {
		expect(precacheExtractJSON).type.not.toBeCallableWith();
	});

	test("default export matches the named export", () => {
		expect(precacheExtractJSONDefault).type.toBe<typeof precacheExtractJSON>();
	});
});
