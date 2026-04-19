// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
import type {
	AfterMiddleware,
	BeforeMiddleware,
	RouteConfig,
} from "@work-bee/core";

interface LoggerOptions {
	logger?: (
		when: string,
		request: Request,
		response: Response | undefined,
		event: ExtendableEvent,
		config: RouteConfig,
		redactHeaders: string[],
	) => void;
	redactHeaders?: string[];
	runOnBefore?: boolean;
	runOnBeforeNetwork?: boolean;
	runOnAfterNetwork?: boolean;
	runOnAfter?: boolean;
}

interface LoggerMiddlewareResult {
	before: BeforeMiddleware | false;
	beforeNetwork: BeforeMiddleware | false;
	afterNetwork: AfterMiddleware | false;
	after: AfterMiddleware | false;
}

declare function loggerMiddleware(opts?: LoggerOptions): LoggerMiddlewareResult;

export default loggerMiddleware;
