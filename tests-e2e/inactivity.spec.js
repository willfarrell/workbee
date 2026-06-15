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

// Collects `{ type: "inactive" }` notifications the worker posts to the page.
const listenForInactive = async (page) => {
	await page.evaluate(() => {
		window.__inactive = [];
		window.navigator.serviceWorker.addEventListener("message", (event) => {
			if (event.data?.type === "inactive") window.__inactive.push(Date.now());
		});
	});
};

// The demo wires inactivityMiddleware with a 3s (0.05min) window.
const INACTIVITY_WINDOW_MS = 3000;

test.describe("inactivityMiddleware", () => {
	test("notifies the page once the inactivity window lapses with no activity", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await awaitServiceWorker(page);
		await listenForInactive(page);

		// No activity is posted: the worker's timer should fire and notify us.
		await expect
			.poll(() => page.evaluate(() => window.__inactive.length), {
				timeout: INACTIVITY_WINDOW_MS * 3,
			})
			.toBeGreaterThanOrEqual(1);

		await context.close();
	});

	test("activity messages reset the timer so no notification fires early", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await awaitServiceWorker(page);
		await listenForInactive(page);

		// Drive activity the same way the inactivity client does on DOM events:
		// post `{ type: "inactivity" }` every second for longer than one window.
		// Each message re-arms the timer, so no `inactive` notification should
		// arrive while we keep the session "active".
		const start = Date.now();
		while (Date.now() - start < INACTIVITY_WINDOW_MS * 1.5) {
			await page.evaluate(() =>
				window.navigator.serviceWorker.controller.postMessage({
					type: "inactivity",
				}),
			);
			await page.waitForTimeout(1000);
		}

		const duringActivity = await page.evaluate(() => window.__inactive.length);
		expect(duringActivity).toBe(0);

		// Stop sending activity; the timer now lapses and the notification fires.
		await expect
			.poll(() => page.evaluate(() => window.__inactive.length), {
				timeout: INACTIVITY_WINDOW_MS * 3,
			})
			.toBeGreaterThanOrEqual(1);

		await context.close();
	});
});
