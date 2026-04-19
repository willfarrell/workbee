import { expect, test } from "@playwright/test";

const localhost = "/index.html";

const awaitServiceWorker = async (page) => {
	await page.goto(localhost);
	await page.evaluate(async () => {
		const registration = await window.navigator.serviceWorker.getRegistration();
		if (registration.active?.state === "activated") {
			return;
		}
		await new Promise((resolve) =>
			window.navigator.serviceWorker.addEventListener(
				"controllerchange",
				resolve,
			),
		);
	});
};

test.describe("Strategies", () => {
	test("strategyNetworkOnly should fetch from network", async ({ browser }) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await context.route("**/strategy/strategyNetworkOnly", async (route) => {
			if (route.request().serviceWorker()) {
				return route.fulfill({
					contentType: "text/plain",
					status: 200,
					body: "network-only-response",
				});
			}
			return route.continue();
		});

		await awaitServiceWorker(page);

		let responseText;
		page.on("response", async (response) => {
			if (response.url().includes("strategyNetworkOnly")) {
				responseText = await response.text();
			}
		});

		await page.evaluate(() => fetch("/strategy/strategyNetworkOnly"));
		expect(responseText).toBe("network-only-response");
		await context.close();
	});

	test("strategyCacheOnly should return precached response", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await context.route("**/strategy/strategyCacheOnly", async (route) => {
			if (route.request().serviceWorker()) {
				return route.fulfill({
					contentType: "text/plain",
					status: 200,
					body: "cache-only-response",
				});
			}
			return route.continue();
		});

		await awaitServiceWorker(page);

		// Wait for precache to complete
		await page.waitForTimeout(500);

		const result = await page.evaluate(async () => {
			const response = await fetch("/strategy/strategyCacheOnly");
			return { status: response.status, fromSW: true };
		});
		expect(result.status).toBe(200);
		await context.close();
	});

	test("strategyNetworkFirst should try network then fall back to cache", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await context.route("**/strategy/strategyNetworkFirst", async (route) => {
			if (route.request().serviceWorker()) {
				return route.fulfill({
					contentType: "text/plain",
					status: 200,
					body: "network-first-response",
				});
			}
			return route.continue();
		});

		await awaitServiceWorker(page);

		const result = await page.evaluate(async () => {
			const response = await fetch("/strategy/strategyNetworkFirst");
			return { status: response.status, text: await response.text() };
		});
		expect(result.status).toBe(200);
		expect(result.text).toBe("network-first-response");
		await context.close();
	});

	test("strategyCacheFirst should try cache then fall back to network", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await context.route("**/strategy/strategyCacheFirst", async (route) => {
			if (route.request().serviceWorker()) {
				return route.fulfill({
					contentType: "text/plain",
					status: 200,
					body: "cache-first-response",
				});
			}
			return route.continue();
		});

		await awaitServiceWorker(page);

		const result = await page.evaluate(async () => {
			const response = await fetch("/strategy/strategyCacheFirst");
			return { status: response.status };
		});
		expect(result.status).toBe(200);
		await context.close();
	});

	test("strategyIgnore should not intercept request", async ({ browser }) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await context.route("**/strategy/strategyIgnore", async (route) => {
			return route.fulfill({
				contentType: "text/plain",
				status: 200,
				body: "ignored-response",
			});
		});

		await awaitServiceWorker(page);

		const result = await page.evaluate(async () => {
			const response = await fetch("/strategy/strategyIgnore");
			return { status: response.status, text: await response.text() };
		});
		expect(result.status).toBe(200);
		expect(result.text).toBe("ignored-response");
		await context.close();
	});

	test("strategyStaleWhileRevalidate should serve cached then revalidate", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await context.route(
			"**/strategy/strategyStaleWhileRevalidate",
			async (route) => {
				if (route.request().serviceWorker()) {
					return route.fulfill({
						contentType: "text/plain",
						status: 200,
						body: "swr-response",
					});
				}
				return route.continue();
			},
		);

		await awaitServiceWorker(page);
		// Precache populates on install; give it a moment.
		await page.waitForTimeout(500);

		const result = await page.evaluate(async () => {
			const response = await fetch("/strategy/strategyStaleWhileRevalidate");
			return { status: response.status };
		});
		expect(result.status).toBe(200);
		await context.close();
	});

	test("strategyStaleIfError should fall back to cache on 5xx", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		let call = 0;
		await context.route("**/strategy/strategyStaleIfError", async (route) => {
			if (!route.request().serviceWorker()) return route.continue();
			call += 1;
			if (call === 1) {
				return route.fulfill({
					contentType: "text/plain",
					status: 200,
					headers: { "Cache-Control": "max-age=60" },
					body: "primed",
				});
			}
			return route.fulfill({ status: 503, body: "" });
		});

		await awaitServiceWorker(page);

		// Warm the cache with the 200.
		await page.evaluate(() => fetch("/strategy/strategyStaleIfError"));
		// Second call hits 503, should serve the cached body.
		const result = await page.evaluate(async () => {
			const response = await fetch("/strategy/strategyStaleIfError");
			return { status: response.status, text: await response.text() };
		});
		expect(result.status).toBe(200);
		expect(result.text).toBe("primed");
		await context.close();
	});

	test("strategyCacheFirstIgnore returns 408 on miss", async ({ browser }) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await awaitServiceWorker(page);

		const result = await page.evaluate(async () => {
			const response = await fetch("/strategy/strategyCacheFirstIgnore");
			return { status: response.status };
		});
		expect(result.status).toBe(408);
		await context.close();
	});

	test("strategyHTMLPartition composes a multi-part HTML response", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await awaitServiceWorker(page);

		const result = await page.evaluate(async () => {
			const response = await fetch("/strategy/strategyHTMLPartition");
			return { status: response.status, text: await response.text() };
		});
		expect(result.status).toBe(200);
		expect(result.text.length).toBeGreaterThan(0);
		await context.close();
	});
});

test.describe("Middleware", () => {
	test("offlineMiddleware should accept POST and return 202", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await awaitServiceWorker(page);

		const result = await page.evaluate(async () => {
			const response = await fetch("/middleware/offlineMiddleware", {
				method: "POST",
			});
			return { status: response.status };
		});
		expect(result.status).toBe(202);
		await context.close();
	});

	test("cacheControlMiddleware overrides Cache-Control on response", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await context.route(
			"**/middleware/cacheControlMiddleware",
			async (route) => {
				if (!route.request().serviceWorker()) return route.continue();
				return route.fulfill({
					contentType: "text/plain",
					status: 200,
					body: "cc",
				});
			},
		);

		await awaitServiceWorker(page);

		const result = await page.evaluate(async () => {
			const response = await fetch("/middleware/cacheControlMiddleware");
			return {
				status: response.status,
				cacheControl: response.headers.get("Cache-Control"),
			};
		});
		expect(result.status).toBe(200);
		expect(result.cacheControl).toMatch(/max-age=30/);
		await context.close();
	});

	test("fallbackMiddleware serves precached fallback when the route fails", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await awaitServiceWorker(page);
		// Precache fills on install.
		await page.waitForTimeout(500);

		const result = await page.evaluate(async () => {
			const response = await fetch("/middleware/fallbackMiddleware");
			return { status: response.status };
		});
		expect(result.status).toBe(200);
		await context.close();
	});

	test("saveDataMiddleware switches strategy when Save-Data header is on", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await awaitServiceWorker(page);
		await page.waitForTimeout(500);

		const result = await page.evaluate(async () => {
			const response = await fetch("/middleware/saveDataMiddleware", {
				headers: { "Save-Data": "on" },
			});
			return { status: response.status };
		});
		// With Save-Data on, strategy swaps to cacheOnly; precache populated the cache.
		expect(result.status).toBe(200);
		await context.close();
	});
});
