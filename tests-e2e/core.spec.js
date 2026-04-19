import { expect, test } from "@playwright/test";

const localhost = "/index.html";

test("Should register ServiceWorker", async ({ browser }) => {
	const context = await browser.newContext();

	await context.route("/test", async (route) => {
		if (route.request().serviceWorker()) {
			return route.fulfill({
				contentType: "text/plain",
				status: 200,
				body: "OK",
			});
		} else {
			return route.continue();
		}
	});

	const page = await context.newPage();
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

	await expect(page).toHaveTitle(/workbee/);

	let res;
	page.on("response", (response) => {
		res = response;
	});

	await page.evaluate(() => fetch("/test"));
	await expect(await res.text()).toBe("OK");
	await expect(res.fromServiceWorker()).toBe(true);
	await context.close();
});
