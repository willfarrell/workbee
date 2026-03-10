import type { AfterMiddleware } from "@work-bee/core";

interface CacheControlOptions {
	cacheControl: string;
}

interface CacheControlMiddlewareResult {
	afterNetwork: AfterMiddleware;
}

declare function cacheControlMiddleware(
	opts: CacheControlOptions,
): CacheControlMiddlewareResult;

export default cacheControlMiddleware;
