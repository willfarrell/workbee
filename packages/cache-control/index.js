// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
import { addHeaderToResponse, isResponse } from "@work-bee/core";

const cacheControlMiddleware = ({ cacheControl }) => {
	const afterNetwork = (_request, response, _event, _config) => {
		if (isResponse(response)) {
			response = addHeaderToResponse(response, "Cache-Control", cacheControl);
		}
		return response;
	};
	return { afterNetwork };
};
export default cacheControlMiddleware;
