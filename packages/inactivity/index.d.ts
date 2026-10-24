// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
import type { AfterMiddleware, BeforeMiddleware } from "@work-bee/core";

interface InactivityOptions {
	/** Defaults to `postMessageToAll`. Receives
	 * `{ type: "inactivity-activity" }` at most once per second. */
	postMessage?: (message: { type: "inactivity-activity" }) => Promise<void>;
}

interface InactivityMiddlewareResult {
	before: BeforeMiddleware;
	after: AfterMiddleware;
}

declare function inactivityMiddleware(
	opts?: InactivityOptions,
): InactivityMiddlewareResult;

export default inactivityMiddleware;
