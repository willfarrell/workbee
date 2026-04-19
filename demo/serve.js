// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
// Minimal static file server for the demo, used by the Playwright e2e tests.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("./static/", import.meta.url)));
const PACKAGES_ROOT = resolve(
	fileURLToPath(new URL("../packages/", import.meta.url)),
);
const PACKAGES_PREFIX = "/packages/";

const mime = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
};

const isInside = (rootDir, candidate) => {
	const rel = relative(rootDir, candidate);
	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

export const handler = (req, res) => {
	const urlPath = decodeURIComponent(req.url.split("?")[0]);
	const [rootDir, subPath] = urlPath.startsWith(PACKAGES_PREFIX)
		? [PACKAGES_ROOT, urlPath.slice(PACKAGES_PREFIX.length)]
		: [ROOT, urlPath.replace(/^\/+/, "")];
	let filePath = resolve(rootDir, subPath);
	if (!isInside(rootDir, filePath) && filePath !== rootDir) {
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
	if (!isInside(rootDir, filePath)) {
		res.writeHead(403).end();
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
