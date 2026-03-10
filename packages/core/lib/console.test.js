import { strictEqual } from "node:assert";
import test from "node:test";
import { consoleError, consoleLog } from "../index.js";

test("console", async (t) => {
	await t.test("consoleLog: should call console.log", (t) => {
		const spy = t.mock.method(console, "log", () => {});
		consoleLog("test");
		strictEqual(spy.mock.callCount(), 1);
	});

	await t.test("consoleError: should call console.error", (t) => {
		const spy = t.mock.method(console, "error", () => {});
		consoleError("test");
		strictEqual(spy.mock.callCount(), 1);
	});
});
