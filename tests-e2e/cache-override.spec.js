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

test.describe("cacheOverrideEvent", () => {
	test("a same-origin page can seed the cache via a postMessage", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await awaitServiceWorker(page);

		// Drive the demo's `cache` message handler the way a page would: hand the
		// worker a request/response pair to store. The worker writes it into the
		// matching route's cache (the default cache for an unrouted URL).
		const result = await page.evaluate(async () => {
			const url = `${location.origin}/cache-override-target`;
			navigator.serviceWorker.controller.postMessage({
				type: "cache",
				request: url,
				response: "OVERRIDDEN-BODY",
			});
			// Poll the CacheStorage directly until the write lands.
			for (let i = 0; i < 50; i++) {
				const match = await caches.match(url);
				if (match) return await match.text();
				await new Promise((r) => setTimeout(r, 100));
			}
			return null;
		});

		expect(result).toBe("OVERRIDDEN-BODY");

		await context.close();
	});
});
