import type { AfterMiddleware, Strategy } from "@work-bee/core";

interface FallbackOptions {
	pathPattern?: RegExp;
	path?: string;
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
