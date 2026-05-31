/* global Request Headers */
import { test } from "node:test";
import fc from "fast-check";
import "../../fixtures/helper.js";
import { domain } from "../../fixtures/helper.js";
import { idbDeserializeRequest, idbSerializeRequest } from "./index.js";

const methodArb = fc.constantFrom(
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
	"HEAD",
);

// Header names/values must be valid HTTP token/field-value bytes or `new
// Headers` throws — that is the Headers constructor's contract, not the code
// under test, so constrain the inputs to what a real request could carry.
const headerNameArb = fc
	.string({ minLength: 1, maxLength: 20 })
	.filter((s) => /^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/.test(s));
const headerValueArb = fc
	.string({ maxLength: 50 })
	.filter((s) => !/[\r\n\0]/.test(s));

test("fuzz: idbSerializeRequest with arbitrary text bodies", async () => {
	await fc.assert(
		fc.asyncProperty(methodArb, fc.string(), async (method, body) => {
			const hasBody = method !== "GET" && method !== "HEAD";
			const request = new Request(`${domain}/200`, {
				method,
				headers: new Headers({ "Content-Type": "application/json" }),
				body: hasBody ? body : undefined,
			});
			const serialized = await idbSerializeRequest(request);
			return (
				serialized.method === method &&
				serialized.url === `${domain}/200` &&
				typeof serialized.headers === "object" &&
				(serialized.body === null ||
					(serialized.body.encoding === "text" &&
						typeof serialized.body.data === "string"))
			);
		}),
		{ numRuns: 500 },
	);
});

test("fuzz: idbSerializeRequest with arbitrary headers", async () => {
	await fc.assert(
		fc.asyncProperty(
			fc.dictionary(headerNameArb, headerValueArb, { maxKeys: 10 }),
			async (headerObj) => {
				const request = new Request(`${domain}/200`, {
					method: "POST",
					headers: new Headers(headerObj),
					body: "{}",
				});
				const serialized = await idbSerializeRequest(request);
				// Header names are always lower-cased on serialization.
				return Object.keys(serialized.headers).every(
					(k) => k === k.toLowerCase(),
				);
			},
		),
		{ numRuns: 500 },
	);
});

test("fuzz: idbSerializeRequest roundtrips binary bodies byte-for-byte", async () => {
	await fc.assert(
		fc.asyncProperty(fc.uint8Array({ maxLength: 256 }), async (bytes) => {
			const request = new Request(`${domain}/200`, {
				method: "POST",
				headers: new Headers({
					"Content-Type": "application/octet-stream",
				}),
				body: bytes.length ? bytes : undefined,
			});
			const serialized = await idbSerializeRequest(request);
			if (bytes.length === 0) {
				return serialized.body === null;
			}
			if (serialized.body.encoding !== "base64") return false;
			const restored = idbDeserializeRequest(serialized);
			const restoredBytes = new Uint8Array(await restored.arrayBuffer());
			if (restoredBytes.length !== bytes.length) return false;
			for (let i = 0; i < bytes.length; i++) {
				if (restoredBytes[i] !== bytes[i]) return false;
			}
			return true;
		}),
		{ numRuns: 500 },
	);
});

test("fuzz: idbSerializeRequest roundtrips text bodies losslessly", async () => {
	await fc.assert(
		fc.asyncProperty(fc.string(), async (body) => {
			const request = new Request(`${domain}/200`, {
				method: "POST",
				headers: new Headers({ "Content-Type": "text/plain" }),
				body,
			});
			const serialized = await idbSerializeRequest(request);
			const restored = idbDeserializeRequest(serialized);
			return (await restored.text()) === body;
		}),
		{ numRuns: 500 },
	);
});

test("fuzz: idbDeserializeRequest tolerates arbitrary serialized shapes", () => {
	fc.assert(
		fc.property(
			fc.record({
				url: fc.constant(`${domain}/200`),
				// Only body-bearing methods are ever queued; GET/HEAD + body is
				// rejected by the Request constructor itself, not this code.
				method: fc.constantFrom("POST", "PUT", "PATCH", "DELETE"),
				headers: fc.dictionary(headerNameArb, headerValueArb, { maxKeys: 5 }),
				body: fc.oneof(
					fc.constant(null),
					fc.record({
						encoding: fc.constantFrom("text", "base64"),
						data: fc.string(),
					}),
					// Unstructured bodies must not crash deserialization.
					fc.string(),
					fc.jsonValue(),
				),
			}),
			(data) => {
				try {
					const request = idbDeserializeRequest(data);
					return request instanceof Request;
				} catch {
					// base64 data that is not a valid base64 string is the only
					// expected throw (atob rejects it); anything else is a real bug.
					return data.body?.encoding === "base64";
				}
			},
		),
		{ numRuns: 1000 },
	);
});
