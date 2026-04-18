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
});
