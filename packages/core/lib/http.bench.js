/* global Headers Request Response */
import { bench, suite } from "node:bench";
import "../../../fixtures/helper.js";
import {
	addHeaderToRequest,
	addHeaderToResponse,
	deleteHeaderFromResponse,
	headersGetAll,
	isRequest,
	isResponse,
	newRequest,
	newResponse,
	urlRemoveHash,
} from "./http.js";

const domain = "http://localhost:8080";

suite("@work-bee/core", () => {
	bench("perf: newRequest", { warmup: 5, samples: 30 }, async (b) => {
		const iterations = 1_000;
		b.start();
		for (let i = 0; i < iterations; i++) {
			newRequest(`${domain}/api/users`);
		}
		b.end(iterations);
	});

	bench("perf: newResponse", { warmup: 5, samples: 30 }, async (b) => {
		const iterations = 1_000;
		b.start();
		for (let i = 0; i < iterations; i++) {
			newResponse(
				{ status: 200, body: "{}" },
				new Headers({ "Content-Type": "application/json" }),
			);
		}
		b.end(iterations);
	});

	bench(
		"perf: isRequest / isResponse",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 5_000;
			const request = new Request(`${domain}/api/users`);
			const response = new Response("{}");
			b.start();
			for (let i = 0; i < iterations; i++) {
				isRequest(request);
				isResponse(response);
			}
			b.end(iterations);
		},
	);

	bench("perf: headersGetAll", { warmup: 5, samples: 30 }, async (b) => {
		const iterations = 5_000;
		const headers = new Headers({
			"Content-Type": "application/json",
			"Cache-Control": "max-age=86400",
			Date: new Date().toString(),
			Expires: new Date().toString(),
			ETag: '"abc123"',
		});
		b.start();
		for (let i = 0; i < iterations; i++) {
			headersGetAll(headers);
		}
		b.end(iterations);
	});

	bench("perf: addHeaderToRequest", { warmup: 5, samples: 30 }, async (b) => {
		const iterations = 100;
		const request = new Request(`${domain}/api/users`);
		b.start();
		for (let i = 0; i < iterations; i++) {
			addHeaderToRequest(request, "Authorization", "Bearer token123");
		}
		b.end(iterations);
	});

	bench("perf: addHeaderToResponse", { warmup: 5, samples: 30 }, async (b) => {
		const iterations = 100;
		const response = new Response("{}", {
			status: 200,
			headers: new Headers({
				"Content-Type": "application/json",
				"Cache-Control": "max-age=86400",
			}),
		});
		b.start();
		for (let i = 0; i < iterations; i++) {
			addHeaderToResponse(response, "Expires", new Date().toString());
		}
		b.end(iterations);
	});

	bench(
		"perf: deleteHeaderFromResponse",
		{ warmup: 5, samples: 30 },
		async (b) => {
			const iterations = 100;
			const response = new Response("{}", {
				status: 200,
				headers: new Headers({
					"Content-Type": "application/json",
					Authorization: "Bearer token123",
				}),
			});
			b.start();
			for (let i = 0; i < iterations; i++) {
				deleteHeaderFromResponse(response, "Authorization");
			}
			b.end(iterations);
		},
	);

	bench("perf: urlRemoveHash", { warmup: 5, samples: 30 }, async (b) => {
		const iterations = 5_000;
		b.start();
		for (let i = 0; i < iterations; i++) {
			urlRemoveHash(`${domain}/page#section`);
		}
		b.end(iterations);
	});
});
