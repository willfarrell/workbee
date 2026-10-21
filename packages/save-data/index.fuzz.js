/* global Request */
import { test } from "node:test";
import fc from "fast-check";
import "../../fixtures/helper.js";
import { strategyCacheOnly, strategyNetworkOnly } from "@work-bee/core";
import saveDataMiddleware from "./index.js";

test("fuzz: saveDataMiddleware only overrides the per-request config copy", () => {
	fc.assert(
		fc.property(fc.boolean(), (saveDataOn) => {
			const { before } = saveDataMiddleware({
				saveDataStrategy: strategyCacheOnly,
			});
			const headers = new Headers();
			if (saveDataOn) {
				headers.set("Save-Data", "on");
			}
			const request = new Request("http://localhost:8080/200", { headers });
			const event = {};
			const shared = { strategy: strategyNetworkOnly };
			// fetchStrategy hands `before` a copy of the route config.
			const config = { ...shared };

			before(request, event, config);

			const expected = saveDataOn ? strategyCacheOnly : strategyNetworkOnly;
			return (
				config.strategy === expected && shared.strategy === strategyNetworkOnly
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
				const { before } = saveDataMiddleware({
					saveDataStrategy: strategyCacheOnly,
				});
				const headers = new Headers();
				headers.set("Save-Data", saveDataValue);
				const request = new Request("http://localhost:8080/200", { headers });
				const event = {};
				const config = { strategy: strategyNetworkOnly };

				before(request, event, config);

				// Only the exact (trimmed by Headers) token "on" switches strategy.
				const expected =
					saveDataValue.trim() === "on"
						? strategyCacheOnly
						: strategyNetworkOnly;
				return config.strategy === expected;
			},
		),
		{ numRuns: 500 },
	);
});
