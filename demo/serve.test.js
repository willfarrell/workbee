import { strictEqual } from "node:assert";
import { createServer } from "node:http";
import test from "node:test";
import { handler } from "./serve.js";

const startServer = async () => {
	const server = createServer(handler);
	await new Promise((resolve) => server.listen(0, resolve));
	const { port } = server.address();
	return { server, baseUrl: `http://localhost:${port}` };
};

test("demo/serve", async (t) => {
	const { server, baseUrl } = await startServer();
	t.after(() => server.close());

	await t.test("sets Service-Worker-Allowed on /sw.js", async () => {
		const response = await fetch(`${baseUrl}/sw.js`);
		strictEqual(response.headers.get("Service-Worker-Allowed"), "/");
		await response.arrayBuffer();
	});

	await t.test(
		"does not set Service-Worker-Allowed on other resources",
		async () => {
			const response = await fetch(`${baseUrl}/index.html`);
			strictEqual(response.headers.get("Service-Worker-Allowed"), null);
			await response.arrayBuffer();
		},
	);

	await t.test(
		"serves workspace /packages/ so SW imports resolve",
		async () => {
			const response = await fetch(`${baseUrl}/packages/core/index.js`);
			strictEqual(response.status, 200);
			strictEqual(
				response.headers.get("Content-Type"),
				"application/javascript; charset=utf-8",
			);
			const body = await response.text();
			strictEqual(/export \* from/.test(body), true);
		},
	);

	await t.test(
		"rejects paths that escape the workspace packages dir",
		async () => {
			const response = await fetch(`${baseUrl}/packages/../../package.json`);
			// Either blocked (403) or not found (404) — never 200.
			strictEqual(response.status >= 400, true);
			await response.arrayBuffer();
		},
	);
});
