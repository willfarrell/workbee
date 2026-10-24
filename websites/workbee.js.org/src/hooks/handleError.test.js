import { deepStrictEqual, strictEqual } from "node:assert";
import test from "node:test";
import { handleError } from "./handleError.js";

const event = {
	request: new Request("https://workbee.js.org/docs?token=secret"),
	url: new URL("https://workbee.js.org/docs?token=secret"),
	route: { id: "/docs" },
	platform: { cf: { city: "Vancouver" }, env: { SECRET: "x" } },
};

const captureConsoleError = (t) => {
	const calls = [];
	t.mock.method(console, "error", (line) => calls.push(line));
	return calls;
};

// Kit 3 shape: `{ kind, error, event }`; framework/validation errors carry
// `{ status, message }` in `error`.
for (const kind of ["app", "framework", "validation"]) {
	test(`handleError: does not log expected ${kind} errors`, async (t) => {
		const calls = captureConsoleError(t);
		await handleError({
			kind,
			error: { status: 404, message: "Not Found" },
			event,
		});
		strictEqual(calls.length, 0);
	});
}

test("handleError: logs unknown errors without request event details", async (t) => {
	const calls = captureConsoleError(t);
	const error = new Error("boom");
	await handleError({ kind: "unknown", error, event });
	strictEqual(calls.length, 1);
	const { stack, ...log } = JSON.parse(calls[0]);
	strictEqual(stack, error.stack);
	deepStrictEqual(log, {
		log_level: "ERROR",
		message: "boom",
		status_code: 500,
		method: "GET",
		path: "/docs",
		route: "/docs",
	});
});
