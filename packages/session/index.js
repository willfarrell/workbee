// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
/* global caches */

// When sessionTimer expires, send inactivity message to main thread
// Main tread check if user has been inactive (https://css-tricks.com/detecting-inactive-users/, https://stackoverflow.com/questions/1060008/is-there-a-way-to-detect-if-a-browser-window-is-not-currently-active)
// Run in main thread (w/ throttling), sync between tabs using sessionStorage
// if active: re-new token with GET /api/auth
// if inactive: prompt with modal to reactivate

// BEGIN Session Management
// Phase I: infinite session length
// Phase II: persist after update (save in cache?)
// Phase III: finite session length

import {
	addHeaderToRequest,
	authorizationHeader,
	deleteHeaderFromResponse,
	isResponse,
	postMessageToFocused,
	postMethod,
} from "@work-bee/core";

const sessionMiddleware = ({
	// Create Session
	authnMethods,
	authnPathPattern,
	// Session Management
	authnGetToken,
	authnGetExpiry,
	authzPathPattern,
	authzSetToken,
	// Session inactivity
	inactivityPromptEventType,
	postMessage,
	//  Destroy Session
	unauthnPathPattern,
	expiryEventType,
}) => {
	authnMethods ??= [postMethod];
	authnGetToken ??= getTokenAuthorization;
	authnGetExpiry ??= () => 12 * 60 * 60 * 1000;
	authzSetToken ??= setTokenAuthorization;

	postMessage ??= postMessageToFocused;

	const inactivityTimeoutBuffer = 60 * 1000;

	let sessionToken = "";
	let sessionCaches = {};

	let before, afterNetwork, after;

	if (authzPathPattern) {
		before = (request, _event, _config) => {
			if (sessionToken && authzPathPattern.test(request.url)) {
				request = authzSetToken(request, sessionToken);
			}
			return request;
		};
		after = (request, response, _event, config) => {
			activityEvent();
			if (authzPathPattern.test(request.url)) {
				sessionCaches[config.cacheKey] ??= true;
			}
			return response;
		};
	}

	if (authnPathPattern || unauthnPathPattern) {
		afterNetwork = async (request, response, _event, _config) => {
			if (isResponse(response)) {
				if (
					authnPathPattern &&
					authnMethods.includes(request.method) &&
					authnPathPattern.test(request.url)
				) {
					const token = await authnGetToken(response.clone());
					const expiry = await authnGetExpiry(response.clone(), token);
					sessionToken = token;
					sessionExpiresInMilliseconds = expiry;
					inactivityTimer();
					sessionTimer();
					// Remove Authorization from response
					response = deleteHeaderFromResponse(response, authorizationHeader);
				} else if (unauthnPathPattern?.test(request.url)) {
					clearSession();
				}
			}
			return response;
		};
	}

	let sessionExpiresInMilliseconds = 0;
	let recentActivityTimestamp = 0;

	let inactivityTimeout;
	const inactivityTimer = () => {
		clearTimeout(inactivityTimeout);
		// 60 sec for time before expire to notify
		inactivityTimeout = setTimeout(
			expiryPromptEvent,
			Math.max(
				0,
				recentActivityTimestamp +
					sessionExpiresInMilliseconds -
					inactivityTimeoutBuffer -
					now(),
			),
		);
	};
	let sessionTimeout;
	const sessionTimer = () => {
		clearTimeout(sessionTimeout);
		sessionTimeout = setTimeout(async () => {
			clearSession();
			if (expiryEventType) {
				postMessage({ type: expiryEventType });
			}
		}, sessionExpiresInMilliseconds);
	};

	const clearSession = () => {
		sessionToken = "";
		for (const cacheFullName of Object.keys(sessionCaches)) {
			caches.delete(cacheFullName);
		}
		sessionCaches = {};
		clearTimeout(inactivityTimeout);
		clearTimeout(sessionTimeout);
	};

	// sw -> Page
	const expiryPromptEvent = () => {
		if (
			recentActivityTimestamp <
			now() - sessionExpiresInMilliseconds + inactivityTimeoutBuffer
		) {
			if (inactivityPromptEventType) {
				postMessage({ type: inactivityPromptEventType });
			}
		} else {
			inactivityTimer();
		}
	};

	// Page -> sw
	const activityEvent = () => {
		recentActivityTimestamp = now();
	};
	// Seed initial timestamp so inactivity timer has a baseline
	activityEvent();

	const destroy = () => {
		clearSession();
	};

	return { before, afterNetwork, after, activityEvent, destroy };
};

const now = () => Date.now();

export const getTokenAuthorization = (response) => {
	// Authorization Bearer <token>
	return response.headers.get(authorizationHeader)?.split(" ")[1];
};

const fromBase64Url = (str) =>
	atob(
		str.replace(/-/g, "+").replace(/_/g, "/") +
			"===".slice((str.length + 3) % 4),
	);

// Parsing-only: extracts expiry from an unverified JWT payload.
// Does NOT validate the token signature. Use a server-side library for validation.
export const getExpiryJWT = (_response, token) => {
	try {
		const ms =
			JSON.parse(fromBase64Url(token.split(".")[1])).exp * 1000 - now();
		return Number.isFinite(ms) ? ms : 0;
	} catch {
		return 0;
	}
};

// Parsing-only: extracts expiry from a PASETO footer (the last `.`-separated
// segment). Does NOT validate the token signature. Reads the last segment so
// both spec-compliant 4-part (`v.p.payload.footer`) and footer-only 3-part
// fixtures are handled. Use a server-side library for validation.
export const getExpiryPaseto = (_response, token) => {
	try {
		const segments = token.split(".");
		const footer = segments[segments.length - 1];
		const ms =
			new Date(JSON.parse(fromBase64Url(footer)).exp).getTime() - now();
		return Number.isFinite(ms) ? ms : 0;
	} catch {
		return 0;
	}
};

export const setTokenAuthorization = (request, token) => {
	// Authorization Bearer <token>
	return addHeaderToRequest(request, authorizationHeader, `Bearer ${token}`);
};

export default sessionMiddleware;
