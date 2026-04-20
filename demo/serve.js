// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
// Minimal static file server for the demo, used by the Playwright e2e tests.
import {
	closeSync,
	createReadStream,
	fstatSync,
	openSync,
	readFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
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

// Allowlist: path segments may only contain letters, digits, `_`, `-`, `.`,
// and `/` separators. Rejects `..`, null bytes, backslashes, and anything
// else that could escape the root. Applied before any fs operation.
const safePath = /^[A-Za-z0-9_./-]*$/;

export const handler = (req, res) => {
	const urlPath = decodeURIComponent(req.url.split("?")[0]);
	const [rootDir, rawInput] = urlPath.startsWith(PACKAGES_PREFIX)
		? [PACKAGES_ROOT, urlPath.slice(PACKAGES_PREFIX.length)]
		: [ROOT, urlPath.replace(/^\/+/, "")];
	const rawSub = rawInput === "" ? "index.html" : rawInput;
	if (!safePath.test(rawSub) || rawSub.split("/").includes("..")) {
		res.writeHead(403).end();
		return;
	}
	let filePath = resolve(rootDir, rawSub);
	if (!filePath.startsWith(rootDir + sep)) {
		res.writeHead(403).end();
		return;
	}
	// Resolve the file via a single fd so the stat/read pair cannot race with
	// an attacker-controlled swap (stat says "file", then read follows a
	// substituted symlink). Fall back to `${filePath}/index.html` if the target
	// turns out to be a directory.
	let fd;
	try {
		fd = openSync(filePath, "r");
		if (fstatSync(fd).isDirectory()) {
			closeSync(fd);
			fd = undefined;
			filePath = resolve(filePath, "index.html");
			if (!filePath.startsWith(rootDir + sep)) {
				res.writeHead(403).end();
				return;
			}
			fd = openSync(filePath, "r");
		}
	} catch {
		if (fd !== undefined) closeSync(fd);
		res.writeHead(404).end();
		return;
	}
	const headers = {
		"Content-Type": mime[extname(filePath)] ?? "application/octet-stream",
	};
	if (urlPath === "/sw.js") {
		headers["Service-Worker-Allowed"] = "/";
	}
	// Rewrite bare `@work-bee/*` specifiers in served JS so the browser can
	// resolve them without a bundler or import map.
	if (extname(filePath) === ".js" && rootDir === PACKAGES_ROOT) {
		const source = readFileSync(fd, "utf8");
		closeSync(fd);
		const rewritten = source.replace(
			/(from\s*["'])@work-bee\/([^"']+)(["'])/g,
			(_, pre, name, post) => `${pre}/packages/${name}/index.js${post}`,
		);
		res.writeHead(200, headers);
		res.end(rewritten);
		return;
	}
	res.writeHead(200, headers);
	createReadStream(null, { fd, autoClose: true }).pipe(res);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const PORT = Number(process.env.PORT ?? 8080);
	createServer(handler).listen(PORT, () => {
		console.log(`demo listening on http://localhost:${PORT}`);
	});
}
