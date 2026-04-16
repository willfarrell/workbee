/* global Request Response */
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";

import { test } from "node:test";
import "../../fixtures/helper.js";
import offlineMiddleware, { idbSerializeRequest } from "./index.js";

test("perf: idbSerializeRequest", async () => {
	const iterations = 10_000;
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await idbSerializeRequest(
			new Request("http://localhost:8080/200", {
				method: "POST",
				headers: new Headers({ "Content-Type": "application/json" }),
				body: JSON.stringify({ key: "value" }),
			}),
		);
	}
	const duration = performance.now() - start;
	console.log(
		`idbSerializeRequest: ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: offlineMiddleware afterNetwork (skip path - GET)", async () => {
	globalThis.indexedDB = new IDBFactory();
	const { afterNetwork, destroy } = offlineMiddleware({ pollDelay: 0 });
	await new Promise((resolve) => setTimeout(resolve, 50));

	const iterations = 100_000;
	const request = new Request("http://localhost:8080/200", { method: "GET" });
	const response = new Response("{}", { status: 200 });
	const event = { waitUntil: () => {} };
	const config = {};
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await afterNetwork(request, response, event, config);
	}
	const duration = performance.now() - start;
	console.log(
		`offlineMiddleware afterNetwork (GET skip): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
	destroy();
});

test("perf: offlineMiddleware afterNetwork (skip path - 200 POST)", async () => {
	globalThis.indexedDB = new IDBFactory();
	const { afterNetwork, destroy } = offlineMiddleware({ pollDelay: 0 });
	await new Promise((resolve) => setTimeout(resolve, 50));

	const iterations = 100_000;
	const response = new Response("{}", { status: 200 });
	const event = { waitUntil: () => {} };
	const config = {};
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await afterNetwork(
			new Request("http://localhost:8080/200", {
				method: "POST",
				body: "data",
			}),
			response,
			event,
			config,
		);
	}
	const duration = performance.now() - start;
	console.log(
		`offlineMiddleware afterNetwork (POST 200 skip): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
	destroy();
});
