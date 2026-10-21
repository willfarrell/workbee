/* global Request Response Headers */
import { bench, suite } from "node:bench";
import "../../fixtures/helper.js";
import { domain } from "../../fixtures/helper.js";
import sessionMiddleware, {
	getExpiryJWT,
	getExpiryPaseto,
	getTokenAuthorization,
	setTokenAuthorization,
} from "./index.js";

suite("@work-bee/session", () => {
	bench(
		"perf: getTokenAuthorization",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 5_000;
			const response = new Response("", {
				headers: new Headers({ Authorization: "Bearer test-token-abc" }),
			});
			b.start();
			for (let i = 0; i < iterations; i++) {
				getTokenAuthorization(response);
			}
			b.end(iterations);
		},
	);

	bench(
		"perf: setTokenAuthorization",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 5_000;
			b.start();
			for (let i = 0; i < iterations; i++) {
				setTokenAuthorization(
					new Request(`${domain}/api/data`),
					"my-token-123",
				);
			}
			b.end(iterations);
		},
	);

	bench("perf: getExpiryJWT", { warmup: 5, samples: 30 }, async (b) => {
		const iterations = 5_000;
		const exp = Math.floor(Date.now() / 1000) + 3600;
		const header = btoa(JSON.stringify({ alg: "HS256" }));
		const payload = btoa(JSON.stringify({ exp }));
		const token = `${header}.${payload}.fake-signature`;
		const response = new Response("");
		b.start();
		for (let i = 0; i < iterations; i++) {
			getExpiryJWT(response, token);
		}
		b.end(iterations);
	});

	bench("perf: getExpiryPaseto", { warmup: 5, samples: 30 }, async (b) => {
		const iterations = 5_000;
		const exp = new Date(Date.now() + 7200 * 1000).toISOString();
		const footer = btoa(JSON.stringify({ exp }));
		const token = `v4.public.${footer}`;
		const response = new Response("");
		b.start();
		for (let i = 0; i < iterations; i++) {
			getExpiryPaseto(response, token);
		}
		b.end(iterations);
	});

	bench(
		"perf: sessionMiddleware before + after (authenticated)",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 1_000;
			const session = sessionMiddleware({
				authzPathPattern: /\/api\//,
				authnPathPattern: /\/auth\/login/,
				authnGetToken: () => "test-token",
				authnGetExpiry: () => 60000,
				postMessage: () => {},
			});

			// Authenticate
			const loginRequest = new Request(`${domain}/auth/login`, {
				method: "POST",
			});
			const loginResponse = new Response("{}", {
				status: 200,
				headers: new Headers({ Authorization: "Bearer test-token" }),
			});
			await session.afterNetwork(
				loginRequest,
				loginResponse,
				{},
				{
					cacheKey: "sw-default",
				},
			);

			const request = new Request(`${domain}/api/data`);
			const response = new Response("{}", { status: 200 });
			const event = {};
			const config = { cacheKey: "sw-api" };
			b.start();
			for (let i = 0; i < iterations; i++) {
				await session.before(new Request(`${domain}/api/data`), event, config);
				session.after(request, response, event, config);
			}
			b.end(iterations);
			session.destroy();
		},
	);
});
