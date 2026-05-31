// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
import { consoleLog, headersGetAll } from "@work-bee/core";

const defaultRedactHeaders = [
	"authorization",
	"cookie",
	"set-cookie",
	"proxy-authorization",
];

const redactHeaderValues = (headers, redactHeaders) => {
	if (!redactHeaders?.length) return headers;
	const redacted = { ...headers };
	for (const key of Object.keys(redacted)) {
		if (redactHeaders.includes(key.toLowerCase())) {
			redacted[key] = "[REDACTED]";
		}
	}
	return redacted;
};

const defaults = {
	logger: (when, request, response, _event, config, redactHeaders) => {
		consoleLog(when, request.url, config.strategy?.name || "custom", {
			url: request.url,
			method: request.method,
			status: response?.status,
			statusText: response?.statusText,
			requestHeaders: redactHeaderValues(
				headersGetAll(request.headers),
				redactHeaders,
			),
			responseHeaders: redactHeaderValues(
				headersGetAll(response?.headers),
				redactHeaders,
			),
			strategy: config.strategy?.name,
		});
	},
	redactHeaders: defaultRedactHeaders,
	runOnBefore: true,
	runOnBeforeNetwork: true,
	runOnAfterNetwork: true,
	runOnAfter: true,
};
const loggerMiddleware = (opts = {}) => {
	const options = { ...defaults, ...opts };

	const beforeMiddleware = (when) => {
		return (request, event, config) => {
			options.logger(
				when,
				request,
				undefined,
				event,
				config,
				options.redactHeaders,
			);
			return request;
		};
	};
	const before = options.runOnBefore && beforeMiddleware("before");
	const beforeNetwork =
		options.runOnBeforeNetwork && beforeMiddleware("beforeNetwork");

	const afterMiddleware = (when) => {
		return (request, response, event, config) => {
			options.logger(
				when,
				request,
				response,
				event,
				config,
				options.redactHeaders,
			);
			return response;
		};
	};
	const afterNetwork =
		options.runOnAfterNetwork && afterMiddleware("afterNetwork");
	const after = options.runOnAfter && afterMiddleware("after");
	return { before, beforeNetwork, afterNetwork, after };
};
export default loggerMiddleware;
