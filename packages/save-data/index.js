// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
import { strategyCacheOnly } from "@work-bee/core";

const saveDataMiddleware = ({ saveDataStrategy } = {}) => {
	// fetchStrategy passes each request its own copy of the route config, so
	// swapping the strategy here only affects this request.
	const before = (request, _event, config) => {
		// Only reads can be served from cache; a cache-only POST never sends.
		const { method } = request;
		if (
			(method === "GET" || method === "HEAD") &&
			request.headers.get("Save-Data") === "on"
		) {
			config.strategy = saveDataStrategy ?? strategyCacheOnly;
		}
		return request;
	};
	return { before };
};
export default saveDataMiddleware;
