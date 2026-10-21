// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
/* global caches */
import {
	fetchInlineStrategy,
	isResponse,
	newRequest,
	strategyNetworkOnly,
} from "@work-bee/core";

// The fallback asset is usually precached under a different cacheName than the
// failing route, so look it up across every cache before going to the network.
const strategyFallback = async (request, event, config) => {
	const response = await caches.match(request);
	if (isResponse(response)) {
		return response;
	}
	return strategyNetworkOnly(request, event, config);
};

const fallbackMiddleware = ({
	pathPattern,
	path,
	statusCodes,
	fallbackStrategy,
} = {}) => {
	if (typeof path !== "string" || path.length === 0) {
		throw new Error("fallbackMiddleware requires a non-empty `path` string.");
	}
	const after = async (request, response, event, config) => {
		if (response?.ok) {
			return response;
		}
		const typeResponse = isResponse(response);
		if (typeResponse && !statusCodes?.includes(response.status)) {
			return response;
		}
		let url = path;
		if (pathPattern) {
			url = request.url.replace(pathPattern, path);
		}
		const status = typeResponse ? response.status : "";
		url = url.replaceAll("{status}", String(status));
		// The fallback asset is fetched fresh as a GET. Passing the original
		// `request` as the RequestInit would copy its `method`, `body`, and — most
		// importantly — its `mode`: a navigation request has `mode: "navigate"`,
		// which makes the `Request` constructor throw in browsers (exactly the
		// offline-fallback-page scenario this middleware exists for). Carry only the
		// headers so content negotiation (Accept, Accept-Language) is preserved.
		return fetchInlineStrategy(
			newRequest(url, { headers: request.headers }),
			event,
			{
				...config,
				// Drop this hook from the nested run: if the fallback asset fails
				// too (offline and not cached) it would otherwise re-enter here and
				// recurse without bound.
				after: config.after.filter((hook) => hook !== after),
				strategy: fallbackStrategy ?? strategyFallback,
			},
		);
	};
	return { after };
};
export default fallbackMiddleware;
