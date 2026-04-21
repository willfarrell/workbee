// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
import type { AfterMiddleware, Strategy } from "@work-bee/core";

interface FallbackOptions {
	/** Required: the fallback resource path (`{status}` is replaced with the
	 * failed response's status code). */
	path: string;
	pathPattern?: RegExp;
	statusCodes?: number[];
	fallbackStrategy?: Strategy;
}

interface FallbackMiddlewareResult {
	after: AfterMiddleware;
}

declare function fallbackMiddleware(
	opts?: FallbackOptions,
): FallbackMiddlewareResult;

export default fallbackMiddleware;
