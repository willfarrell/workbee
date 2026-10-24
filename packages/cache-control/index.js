// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
import { addHeaderToResponse, isResponse } from "@work-bee/core";

const cacheControlMiddleware = ({ cacheControl } = {}) => {
	if (typeof cacheControl !== "string" || cacheControl.length === 0) {
		throw new Error(
			"cacheControlMiddleware requires a non-empty `cacheControl` string.",
		);
	}
	const afterNetwork = (_request, response, _event, _config) => {
		// Opaque (no-cors / opaqueredirect) responses have status 0, which
		// `new Response()` rejects, so they can't be rebuilt with a new header.
		if (isResponse(response) && response.status !== 0) {
			response = addHeaderToResponse(response, "Cache-Control", cacheControl);
		}
		return response;
	};
	return { afterNetwork };
};
export default cacheControlMiddleware;
