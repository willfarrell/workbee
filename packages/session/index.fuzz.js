/* global Response */
import { test } from "node:test";
import fc from "fast-check";
import "../../fixtures/helper.js";
import {
	getExpiryJWT,
	getExpiryPaseto,
	getTokenAuthorization,
} from "./index.js";

test("fuzz: getExpiryJWT with arbitrary tokens", () => {
	fc.assert(
		fc.property(fc.string(), (token) => {
			const response = new Response("");
			const result = getExpiryJWT(response, token);
			return typeof result === "number" && !Number.isNaN(result);
		}),
		{ numRuns: 1000 },
	);
});

test("fuzz: getExpiryJWT with structured but random payloads", () => {
	fc.assert(
		fc.property(fc.jsonValue(), (payload) => {
			const header = btoa(JSON.stringify({ alg: "HS256" }));
			const payloadStr = btoa(JSON.stringify(payload));
			const token = `${header}.${payloadStr}.signature`;
			const response = new Response("");
			const result = getExpiryJWT(response, token);
			return typeof result === "number" && !Number.isNaN(result);
		}),
		{ numRuns: 1000 },
	);
});

test("fuzz: getExpiryPaseto with arbitrary tokens", () => {
	fc.assert(
		fc.property(fc.string(), (token) => {
			const response = new Response("");
			const result = getExpiryPaseto(response, token);
			return typeof result === "number" && !Number.isNaN(result);
		}),
		{ numRuns: 1000 },
	);
});

test("fuzz: getExpiryPaseto with structured but random footers", () => {
	fc.assert(
		fc.property(fc.jsonValue(), (footer) => {
			const footerStr = btoa(JSON.stringify(footer));
			const token = `v4.public.${footerStr}`;
			const response = new Response("");
			const result = getExpiryPaseto(response, token);
			return typeof result === "number" && !Number.isNaN(result);
		}),
		{ numRuns: 1000 },
	);
});

test("fuzz: getTokenAuthorization with arbitrary headers", () => {
	fc.assert(
		fc.property(
			fc
				.string()
				.filter(
					(s) => !s.includes("\n") && !s.includes("\r") && !s.includes("\0"),
				),
			(authValue) => {
				const response = new Response("", {
					headers: new Headers({ Authorization: authValue }),
				});
				const result = getTokenAuthorization(response);
				return result === undefined || typeof result === "string";
			},
		),
		{ numRuns: 1000 },
	);
});
