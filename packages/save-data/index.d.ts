import type {
	AfterMiddleware,
	BeforeMiddleware,
	Strategy,
} from "@work-bee/core";

interface SaveDataOptions {
	saveDataStrategy?: Strategy;
}

interface SaveDataMiddlewareResult {
	before: BeforeMiddleware;
	after: AfterMiddleware;
}

declare function saveDataMiddleware(
	opts: SaveDataOptions,
): SaveDataMiddlewareResult;

export default saveDataMiddleware;
