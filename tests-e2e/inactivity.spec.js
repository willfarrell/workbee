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

// The demo page's inactivity client dispatches `inactive` on window when its
// countdown lapses. Record them from before any page script runs.
const listenForInactive = async (page) => {
	await page.addInitScript(() => {
		window.__inactive = [];
		window.addEventListener("inactive", () =>
			window.__inactive.push(Date.now()),
		);
	});
};

const inactiveCount = (page) => page.evaluate(() => window.__inactive.length);

// The demo wires the inactivity client with a 3s (0.05min) window.
const INACTIVITY_WINDOW_MS = 3000;

// Repeats `action` every second for longer than one inactivity window.
const keepActive = async (page, action) => {
	const start = Date.now();
	while (Date.now() - start < INACTIVITY_WINDOW_MS * 1.5) {
		await action();
		await page.waitForTimeout(1000);
	}
};

test.describe("inactivity", () => {
	test("notifies the page once the inactivity window lapses with no activity", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		await listenForInactive(page);

		await awaitServiceWorker(page);

		await expect
			.poll(() => inactiveCount(page), { timeout: INACTIVITY_WINDOW_MS * 3 })
			.toBeGreaterThanOrEqual(1);

		await context.close();
	});

	test("DOM activity resets the countdown", async ({ browser }) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		await listenForInactive(page);

		await awaitServiceWorker(page);
		// Discard any lapse that happened while the worker was installing.
		await page.evaluate(() => {
			window.__inactive.length = 0;
		});

		await keepActive(page, () => page.keyboard.press("Shift"));
		expect(await inactiveCount(page)).toBe(0);

		// Stop interacting; the countdown now lapses.
		await expect
			.poll(() => inactiveCount(page), { timeout: INACTIVITY_WINDOW_MS * 3 })
			.toBeGreaterThanOrEqual(1);

		await context.close();
	});

	test("requests handled by the ServiceWorker reset the countdown", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		await listenForInactive(page);

		await awaitServiceWorker(page);
		await expect
			.poll(() =>
				page.evaluate(() => Boolean(window.navigator.serviceWorker.controller)),
			)
			.toBe(true);
		await page.evaluate(() => {
			window.__inactive.length = 0;
		});

		// No DOM events: only the worker's request notifications keep it alive.
		await keepActive(page, () =>
			page.evaluate(() => fetch("/index.html").then((r) => r.text())),
		);
		expect(await inactiveCount(page)).toBe(0);

		await expect
			.poll(() => inactiveCount(page), { timeout: INACTIVITY_WINDOW_MS * 3 })
			.toBeGreaterThanOrEqual(1);

		await context.close();
	});
});
