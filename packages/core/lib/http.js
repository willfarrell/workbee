// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
/* global Headers Request Response */
export const headersGetAll = (headersObj) => {
	if (!headersObj) return {};
	if (typeof headersObj.entries === "function") {
		const headers = {};
		for (const [key, value] of headersObj.entries() ?? []) {
			headers[key] = value;
		}
		return headers;
	}
	return { ...headersObj };
};

export const urlRemoveHash = (url) => {
	const urlObj = new URL(url);
	urlObj.hash = "";
	return urlObj.toString();
};

export const isRequest = (value) => value instanceof Request;
export const newRequest = (url, options) => new Request(url, options);

export const addHeaderToRequest = (request, key, value) => {
	const headers = new Headers(headersGetAll(request.headers));
	headers.set(key, value);
	return new Request(request, { headers });
};

export const isResponse = (response) => response instanceof Response;
export const newResponse = ({ status, statusText, body }, headersObj) => {
	const headers = headersGetAll(headersObj);
	if (headers.Date === undefined && headers.date === undefined) {
		headers.Date = new Date().toString();
	}
	return new Response(body, { status, statusText, headers });
};

const rebuildResponse = (response, headers) => {
	const clone = response.clone();
	return new Response(clone.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
};

export const addHeaderToResponse = (response, key, value) => {
	const headers = new Headers(headersGetAll(response.headers));
	headers.set(key, value);
	return rebuildResponse(response, headers);
};

export const deleteHeaderFromResponse = (response, key) => {
	const headers = new Headers(headersGetAll(response.headers));
	headers.delete(key);
	return rebuildResponse(response, headers);
};

export const getMethod = "GET";
export const postMethod = "POST";
export const putMethod = "PUT";
export const patchMethod = "PATCH";
export const deleteMethod = "DELETE";
export const headMethod = "HEAD";
export const optionsMethod = "OPTIONS";

export const authorizationHeader = "Authorization";
