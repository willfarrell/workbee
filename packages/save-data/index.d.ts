// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
import type { BeforeMiddleware, Strategy } from "@work-bee/core";

interface SaveDataOptions {
	saveDataStrategy?: Strategy;
}

interface SaveDataMiddlewareResult {
	before: BeforeMiddleware;
}

declare function saveDataMiddleware(
	opts?: SaveDataOptions,
): SaveDataMiddlewareResult;

export default saveDataMiddleware;
