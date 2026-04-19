// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
// Minimal static file server for the demo, used by the Playwright e2e tests.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("./static/", import.meta.url).pathname;
const PACKAGES_ROOT = new URL("../packages/", import.meta.url).pathname;
const PACKAGES_PREFIX = "/packages/";

const mime = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
};

export const handler = (req, res) => {
	const urlPath = decodeURIComponent(req.url.split("?")[0]);
	const [rootDir, subPath] = urlPath.startsWith(PACKAGES_PREFIX)
		? [PACKAGES_ROOT, urlPath.slice(PACKAGES_PREFIX.length)]
		: [ROOT, urlPath];
	let filePath = normalize(join(rootDir, subPath)).replace(/\\/g, "/");
	if (!filePath.startsWith(rootDir.replace(/\\/g, "/"))) {
		res.writeHead(403).end();
		return;
	}
	try {
		const stat = statSync(filePath);
		if (stat.isDirectory()) filePath = join(filePath, "index.html");
	} catch {
		res.writeHead(404).end();
		return;
	}
	const headers = {
		"Content-Type": mime[extname(filePath)] ?? "application/octet-stream",
	};
	if (urlPath === "/sw.js") {
		headers["Service-Worker-Allowed"] = "/";
	}
	res.writeHead(200, headers);
	createReadStream(filePath).pipe(res);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const PORT = Number(process.env.PORT ?? 8080);
	createServer(handler).listen(PORT, () => {
		console.log(`demo listening on http://localhost:${PORT}`);
	});
}
