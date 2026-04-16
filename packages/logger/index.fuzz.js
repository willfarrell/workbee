/* global Request Response */
import { test } from "node:test";
import fc from "fast-check";
import "../../fixtures/helper.js";
import { strategyNetworkOnly } from "@work-bee/core";
import loggerMiddleware from "./index.js";

test("fuzz: loggerMiddleware with arbitrary request URLs", () => {
	fc.assert(
		fc.property(fc.webUrl(), (url) => {
			const { before, after } = loggerMiddleware({ logger: () => {} });
			const request = new Request(url);
			const response = new Response("{}", { status: 200 });
			const event = {};
			const config = { strategy: strategyNetworkOnly };

			const req = before(request, event, config);
			const res = after(request, response, event, config);
			return req instanceof Request && res instanceof Response;
		}),
		{ numRuns: 500 },
	);
});

test("fuzz: loggerMiddleware with arbitrary options", () => {
	fc.assert(
		fc.property(
			fc.boolean(),
			fc.boolean(),
			fc.boolean(),
			fc.boolean(),
			(runOnBefore, runOnBeforeNetwork, runOnAfterNetwork, runOnAfter) => {
				const middleware = loggerMiddleware({
					logger: () => {},
					runOnBefore,
					runOnBeforeNetwork,
					runOnAfterNetwork,
					runOnAfter,
				});

				return (
					(runOnBefore
						? typeof middleware.before === "function"
						: !middleware.before) &&
					(runOnBeforeNetwork
						? typeof middleware.beforeNetwork === "function"
						: !middleware.beforeNetwork) &&
					(runOnAfterNetwork
						? typeof middleware.afterNetwork === "function"
						: !middleware.afterNetwork) &&
					(runOnAfter
						? typeof middleware.after === "function"
						: !middleware.after)
				);
			},
		),
		{ numRuns: 100 },
	);
});
