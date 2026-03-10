/* global Response Headers */
import { test } from "node:test";
import "../../../fixtures/helper.js";
import { cacheExpired } from "./cache.js";

test("perf: cacheExpired - expired response", async () => {
	const iterations = 100_000;
	const pastDate = new Date(Date.now() - 86400 * 1000).toString();
	const response = new Response("", {
		headers: new Headers({ Expires: pastDate }),
	});
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		cacheExpired(response);
	}
	const duration = performance.now() - start;
	console.log(
		`cacheExpired (expired): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: cacheExpired - valid response", async () => {
	const iterations = 100_000;
	const futureDate = new Date(Date.now() + 86400 * 1000).toString();
	const response = new Response("", {
		headers: new Headers({ Expires: futureDate }),
	});
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		cacheExpired(response);
	}
	const duration = performance.now() - start;
	console.log(
		`cacheExpired (valid): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});

test("perf: cacheExpired - falsy response", async () => {
	const iterations = 1_000_000;
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		cacheExpired(undefined);
	}
	const duration = performance.now() - start;
	console.log(
		`cacheExpired (undefined): ${iterations} iterations in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(4)}ms/op)`,
	);
});
