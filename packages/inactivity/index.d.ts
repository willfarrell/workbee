// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
import type { AfterMiddleware, BeforeMiddleware } from "@work-bee/core";

interface InactivityOptions {
	inactivityAllowedInMin?: number;
	inactivityEvent?: () => void;
}

interface InactivityMiddlewareResult {
	before: BeforeMiddleware;
	after: AfterMiddleware;
	postMessageEvent: () => void;
}

declare function inactivityMiddleware(
	opts?: InactivityOptions,
): InactivityMiddlewareResult;

export default inactivityMiddleware;
