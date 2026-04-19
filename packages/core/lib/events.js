// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
/* global skipWaiting clients BroadcastChannel */
import { cachePut, cachesDelete } from "./cache.js";
import { compileRoute } from "./config.js";
import { consoleError } from "./console.js";
import { newRequest, newResponse } from "./http.js";

export const eventInstall = (event, config) => {
	event.waitUntil(eventInstallWaitUntil(event, config));
	if (config.skipWaiting !== false) {
		skipWaiting();
	}
};

const eventInstallWaitUntil = async (event, config) => {
	let {
		routes,
		postMessage,
		extract = precacheExtractJSON,
		eventType,
	} = config.precache;
	// Use and external config
	if (typeof routes === "string") {
		const response = await fetchInlineStrategy(
			newRequest(routes),
			event,
			config.precache,
		);

		const extracted = await extract(response);
		// Externally-fetched routes may be plain {path} / strings; run them
		// through the same compilation pipeline as inline routes so each has
		// flattened middleware arrays and a cacheKey.
		routes = extracted.map((r) => compileRoute(config.precache, r));
	}
	await Promise.all(
		routes.map((routeConfig) =>
			fetchInlineStrategy(newRequest(routeConfig.path), event, routeConfig),
		),
	);

	if (eventType) {
		await postMessage({ type: eventType });
	}
};

// TODO move to plugin package
export const precacheExtractJSON = (response) => {
	if (response.headers.get("Content-Type") !== "application/json") return [];
	return response.json();
};

export const eventActivate = (event, config) => {
	event.waitUntil(eventActivateWaitUntil(event, config));
	event.waitUntil(clients.claim());
};

const eventActivateWaitUntil = async (_event, config) => {
	const exclude = config.precache.routes
		.concat(config.routes)
		.map((routeConfig) => routeConfig.cacheKey);
	await cachesDelete(exclude);
	const { postMessage, eventType } = config.activate;
	if (eventType) {
		await postMessage({ type: eventType });
	}
};

export const eventFetch = (event, config) => {
	event.respondWith(eventFetchRespondWith(event, config));
};

const eventFetchRespondWith = async (event, config) => {
	const result = await fetchStrategy(
		event.request,
		event,
		findRouteConfig(config, event.request),
	);
	// fetchStrategy returns Response | Error; convert Error back to a rejection
	// so `respondWith` falls through to the browser's default handling instead
	// of silently breaking with a non-Response value.
	if (result instanceof Error) throw result;
	return result;
};

export const findRouteConfig = (config, request) => {
	const { method, url } = request;
	for (const routeConfig of config.routes) {
		if (
			routeConfig.methods.includes(method) &&
			routeConfig.pathPattern.test(url)
		) {
			return routeConfig;
		}
	}
	return config;
};

export const fetchInlineStrategy = async (request, event, config) => {
	// process waitUntil inline due to being nested
	const waitUntils = [];
	const waitUntil = (promise) => waitUntils.push(promise);
	const response = await fetchStrategy(
		request,
		{
			...event,
			waitUntil,
		},
		config,
	);
	await Promise.all(waitUntils);
	return response;
};

export const fetchStrategy = async (request, event, config) => {
	for (const before of config.before) {
		request = await before(request, event, config);
	}
	let response;
	try {
		response = await config.strategy(request, event, config);
	} catch (e) {
		response = e;
	}
	for (const after of config.after) {
		response = await after(request, response, event, config);
	}
	return response;
};

export const cacheOverrideEvent = (config, { allowedOrigins } = {}) => {
	if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) {
		throw new Error(
			"cacheOverrideEvent requires `allowedOrigins` (non-empty string[]) " +
				"to prevent cache poisoning from untrusted origins.",
		);
	}
	return (messageEvent) => {
		const sourceUrl = messageEvent?.source?.url;
		if (!sourceUrl) return;
		const origin = new URL(sourceUrl).origin;
		if (!allowedOrigins.includes(origin)) return;
		const data = messageEvent?.data ?? messageEvent;
		let { request, response } = data;
		if (typeof request === "string") {
			request = newRequest(request);
		}
		const routeConfig = findRouteConfig(config, request);
		if (typeof response === "string") {
			response = newResponse({ url: request.url, body: response });
		}
		return cachePut(routeConfig.cacheKey, request, response);
	};
};

export const backgroundFetchSuccessEvent = (event) => {
	event.waitUntil(backgroundFetchSuccessEventWaitUntil(event));
};

const backgroundFetchSuccessEventWaitUntil = async ({ registration }) => {
	new BroadcastChannel(registration.id).postMessage({ stored: true });
};

export const backgroundFetchFailEvent = (event) => {
	consoleError(event);
};
