// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
import { strategyCacheOnly } from "@work-bee/core";

const saveDataMiddleware = ({ saveDataStrategy } = {}) => {
	const originalStrategies = new WeakMap();
	const before = (request, event, config) => {
		// Only remember the original strategy when actually overriding it; the
		// common (no Save-Data) path then skips the WeakMap write entirely and
		// `after` has nothing to restore.
		if (request.headers.get("Save-Data") === "on") {
			originalStrategies.set(event, config.strategy);
			config.strategy = saveDataStrategy ?? strategyCacheOnly;
		}
		return request;
	};
	const after = (_request, response, event, config) => {
		const originalStrategy = originalStrategies.get(event);
		if (originalStrategy) {
			config.strategy = originalStrategy;
			originalStrategies.delete(event);
		}
		return response;
	};
	return { before, after };
};
export default saveDataMiddleware;
