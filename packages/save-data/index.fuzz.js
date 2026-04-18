/* global Request Response */
import { test } from "node:test";
import fc from "fast-check";
import "../../fixtures/helper.js";
import { strategyCacheOnly, strategyNetworkOnly } from "@work-bee/core";
import saveDataMiddleware from "./index.js";

test("fuzz: saveDataMiddleware restores original strategy", () => {
	fc.assert(
		fc.property(fc.boolean(), (saveDataOn) => {
			const { before, after } = saveDataMiddleware({
				saveDataStrategy: strategyCacheOnly,
			});
			const headers = new Headers();
			if (saveDataOn) {
				headers.set("Save-Data", "on");
			}
			const request = new Request("http://localhost:8080/200", { headers });
			const response = new Response("{}", { status: 200 });
			const event = {};
			const config = { strategy: strategyNetworkOnly };

			before(request, event, config);
			const strategyDuringRequest = config.strategy;
			after(request, response, event, config);

			if (saveDataOn) {
				return (
					strategyDuringRequest === strategyCacheOnly &&
					config.strategy === strategyNetworkOnly
				);
			}
			return (
				strategyDuringRequest === strategyNetworkOnly &&
				config.strategy === strategyNetworkOnly
			);
		}),
		{ numRuns: 500 },
	);
});

test("fuzz: saveDataMiddleware with arbitrary Save-Data header values", () => {
	fc.assert(
		fc.property(
			fc
				.string()
				.filter(
					(s) => !s.includes("\n") && !s.includes("\r") && !s.includes("\0"),
				),
			(saveDataValue) => {
				const { before, after } = saveDataMiddleware({
					saveDataStrategy: strategyCacheOnly,
				});
				const headers = new Headers();
				headers.set("Save-Data", saveDataValue);
				const request = new Request("http://localhost:8080/200", { headers });
				const response = new Response("{}", { status: 200 });
				const event = {};
				const config = { strategy: strategyNetworkOnly };

				before(request, event, config);
				after(request, response, event, config);

				// Strategy should be restored after after()
				return config.strategy === strategyNetworkOnly;
			},
		),
		{ numRuns: 500 },
	);
});
