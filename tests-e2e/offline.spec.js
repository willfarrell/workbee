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

test.describe("offlineMiddleware", () => {
	test("enqueues a failed POST then replays it once the network recovers", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		// The route fails (503) on the first hit so the middleware enqueues the
		// POST into IndexedDB and answers 202. Subsequent hits succeed (200), which
		// is what the queued request should see when it is replayed.
		const seen = [];
		await context.route("**/middleware/offlineMiddleware", async (route) => {
			if (!route.request().serviceWorker()) return route.continue();
			seen.push(route.request().method());
			if (seen.length === 1) {
				return route.fulfill({ status: 503, body: "" });
			}
			return route.fulfill({
				contentType: "text/plain",
				status: 200,
				body: "replayed",
			});
		});

		await awaitServiceWorker(page);

		// Record the worker's enqueue/dequeue notifications so we can await the
		// IndexedDB write landing instead of racing it.
		await page.evaluate(() => {
			window.__sw = { enqueue: 0, dequeue: 0 };
			window.navigator.serviceWorker.addEventListener("message", (event) => {
				if (event.data?.type === "offline-enqueue") window.__sw.enqueue += 1;
				if (event.data?.type === "offline-dequeue") window.__sw.dequeue += 1;
			});
		});

		// (a) The POST fails at the network, is queued, and the page gets 202.
		const enqueue = await page.evaluate(async () => {
			const response = await fetch("/middleware/offlineMiddleware", {
				method: "POST",
				body: "queued-payload",
			});
			return { status: response.status };
		});
		expect(enqueue.status).toBe(202);
		expect(seen).toEqual(["POST"]);

		// Wait until the request is actually persisted to the queue.
		await expect
			.poll(() => page.evaluate(() => window.__sw.enqueue), { timeout: 5000 })
			.toBe(1);

		// (b) Network recovers. Signal the worker the same way the offline client
		// does on the `online` event, which drains and replays the queue.
		await page.evaluate(() =>
			window.navigator.serviceWorker.controller.postMessage({
				type: "online",
			}),
		);

		// (c) The queued POST is replayed against the now-healthy route and the
		// worker reports the successful dequeue.
		await expect
			.poll(() => page.evaluate(() => window.__sw.dequeue), { timeout: 5000 })
			.toBe(1);
		expect(seen.length).toBeGreaterThanOrEqual(2);
		expect(seen[1]).toBe("POST");

		await context.close();
	});
});
