import { equal } from "node:assert";
import { mock, test } from "node:test";
import { postMessageToAll, postMessageToFocused } from "../index.js";

test("postMessage", async (t) => {
	// *** postMessageToAll *** //
	await t.test(
		"postMessageToAll: should send message to all clients",
		async () => {
			const client1 = { postMessage: mock.fn() };
			const client2 = { postMessage: mock.fn() };
			global.clients = {
				matchAll: () => Promise.resolve([client1, client2]),
			};

			await postMessageToAll({ type: "test" });

			// Allow the .then() chain to resolve
			await new Promise((resolve) => setTimeout(resolve, 0));

			equal(client1.postMessage.mock.callCount(), 1);
			equal(client2.postMessage.mock.callCount(), 1);
			equal(client1.postMessage.mock.calls[0].arguments[0].type, "test");
			equal(client2.postMessage.mock.calls[0].arguments[0].type, "test");
		},
	);

	await t.test("postMessageToAll: should handle no clients", async () => {
		global.clients = {
			matchAll: () => Promise.resolve([]),
		};

		await postMessageToAll({ type: "test" });
		await new Promise((resolve) => setTimeout(resolve, 0));

		// No error thrown
	});

	// *** postMessageToFocused *** //
	await t.test(
		"postMessageToFocused: should send to focused client",
		async () => {
			const client1 = { focused: false, postMessage: mock.fn() };
			const client2 = { focused: true, postMessage: mock.fn() };
			const client3 = { focused: false, postMessage: mock.fn() };
			global.clients = {
				matchAll: () => Promise.resolve([client1, client2, client3]),
			};

			await postMessageToFocused({ type: "focused" });
			await new Promise((resolve) => setTimeout(resolve, 0));

			equal(client1.postMessage.mock.callCount(), 0);
			equal(client2.postMessage.mock.callCount(), 1);
			equal(client3.postMessage.mock.callCount(), 0);
			equal(client2.postMessage.mock.calls[0].arguments[0].type, "focused");
		},
	);

	await t.test(
		"postMessageToFocused: should send to first client when none focused",
		async () => {
			const client1 = { focused: false, postMessage: mock.fn() };
			const client2 = { focused: false, postMessage: mock.fn() };
			global.clients = {
				matchAll: () => Promise.resolve([client1, client2]),
			};

			await postMessageToFocused({ type: "fallback" });
			await new Promise((resolve) => setTimeout(resolve, 0));

			equal(client1.postMessage.mock.callCount(), 1);
			equal(client2.postMessage.mock.callCount(), 0);
			equal(client1.postMessage.mock.calls[0].arguments[0].type, "fallback");
		},
	);

	await t.test("postMessageToFocused: should handle no clients", async () => {
		global.clients = {
			matchAll: () => Promise.resolve([]),
		};

		await postMessageToFocused({ type: "empty" });
		await new Promise((resolve) => setTimeout(resolve, 0));

		// No error thrown
	});
});
