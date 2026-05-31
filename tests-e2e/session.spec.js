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

const TOKEN = "session-token-abc123";

test.describe("sessionMiddleware", () => {
	test("strips Authorization on login, carries Bearer on authz, clears on logout", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		// login: server hands back a Bearer token. sessionMiddleware should
		// capture it and strip Authorization before the response reaches the page.
		await context.route("**/login", async (route) => {
			if (!route.request().serviceWorker()) return route.continue();
			return route.fulfill({
				contentType: "application/json",
				status: 200,
				headers: { Authorization: `Bearer ${TOKEN}` },
				body: "{}",
			});
		});

		// authn: echo back whatever Authorization header the SW forwarded so the
		// page can observe whether the Bearer token was attached.
		await context.route("**/authn", async (route) => {
			if (!route.request().serviceWorker()) return route.continue();
			const auth = route.request().headers().authorization ?? "";
			return route.fulfill({
				contentType: "text/plain",
				status: 200,
				body: auth,
			});
		});

		// logout: plain 200, sessionMiddleware clears the stored token.
		await context.route("**/logout", async (route) => {
			if (!route.request().serviceWorker()) return route.continue();
			return route.fulfill({
				contentType: "text/plain",
				status: 200,
				body: "ok",
			});
		});

		await awaitServiceWorker(page);

		// (a) The authn login response reaches the page with Authorization stripped.
		const login = await page.evaluate(async () => {
			const response = await fetch("/login", { method: "POST" });
			return {
				status: response.status,
				authorization: response.headers.get("Authorization"),
			};
		});
		expect(login.status).toBe(200);
		expect(login.authorization).toBeNull();

		// (b) A subsequent same-origin authz fetch carries the Bearer token.
		const authed = await page.evaluate(async () => {
			const response = await fetch("/authn");
			return { status: response.status, text: await response.text() };
		});
		expect(authed.status).toBe(200);
		expect(authed.text).toBe(`Bearer ${TOKEN}`);

		// (c) Logout clears the token; the next authz fetch no longer carries it.
		const logout = await page.evaluate(async () => {
			const response = await fetch("/logout", { method: "POST" });
			return { status: response.status };
		});
		expect(logout.status).toBe(200);

		const afterLogout = await page.evaluate(async () => {
			const response = await fetch("/authn");
			return { status: response.status, text: await response.text() };
		});
		expect(afterLogout.status).toBe(200);
		expect(afterLogout.text).toBe("");

		await context.close();
	});
});
