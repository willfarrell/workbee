// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
/* global caches self */

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
	consoleError,
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
	authzAllowedOrigins,
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
	const sessionCaches = new Set();
	const purgedCaches = {};
	let sessionExpiresAt = 0;
	let recentActivityTimestamp = 0;

	let before, afterNetwork, after;

	const swOrigin = globalThis.self?.location?.origin;
	// Fail closed: if no allow-list could be resolved (neither
	// `authzAllowedOrigins` nor a derivable SW origin), never attach the token.
	// A real ServiceWorker always resolves `self.location.origin`, so this only
	// denies in degenerate environments where the origin is unknowable.
	const allowedOrigins =
		Array.isArray(authzAllowedOrigins) && authzAllowedOrigins.length
			? authzAllowedOrigins
			: swOrigin
				? [swOrigin]
				: // Stryker disable next-line ArrayDeclaration: a seeded non-origin
					// string can never equal a parsed URL origin, so it denies too.
					[];
	// Logins may also come from the SW's own origin, even when an explicit
	// allow-list replaces it for authz.
	// Stryker disable next-line ArrayDeclaration: a seeded non-origin string can
	// never equal a parsed URL origin, so it allow-lists nothing extra.
	const authnOrigins = allowedOrigins.concat(swOrigin ?? []);
	const isAllowedOrigin = (url, origins = allowedOrigins) => {
		// try/catch rather than `URL.parse`/`URL.canParse`, which need Chrome /
		// Firefox 126 and Safari 18.
		let origin;
		try {
			origin = new URL(url).origin;
		} catch {
			// Unparseable: `origin` stays undefined and is never allow-listed.
		}
		return origins.includes(origin);
	};

	// Deletes only authz entries, so routes sharing the cacheName keep theirs.
	// `has` first: `open` would create an empty cache just to find nothing.
	const purgeAuthzEntries = async (cacheKey) => {
		if (!(await caches.has(cacheKey))) return;
		const cache = await caches.open(cacheKey);
		const requests = await cache.keys();
		await Promise.all(
			requests
				.filter((request) => authzPathPattern.test(request.url))
				.map((request) => cache.delete(request)),
		);
	};

	if (authzPathPattern) {
		before = async (request, _event, config) => {
			if (!authzPathPattern.test(request.url)) {
				return request;
			}
			if (!sessionToken) {
				// The token lives only in memory, so a restarted SW has none, but
				// the caches survive: responses cached for the previous session
				// must not be served (nor outlive a logout this SW never saw).
				// Purge once per cacheKey; later caching is tracked for logout.
				purgedCaches[config.cacheKey] ??= purgeAuthzEntries(config.cacheKey);
				await purgedCaches[config.cacheKey];
			} else if (isAllowedOrigin(request.url)) {
				request = authzSetToken(request, sessionToken);
			}
			return request;
		};
		after = (request, response, _event, config) => {
			activityEvent();
			// Every cache this route writes; logout purges only its authz entries.
			sessionCaches.add(config.cacheKey);
			return response;
		};
	}

	if (authnPathPattern || unauthnPathPattern) {
		afterNetwork = async (request, response, _event, _config) => {
			if (
				isResponse(response) &&
				authnPathPattern &&
				authnMethods.includes(request.method) &&
				authnPathPattern.test(request.url) &&
				// A token from any other origin could fixate a foreign session.
				isAllowedOrigin(request.url, authnOrigins)
			) {
				const token = await authnGetToken(response.clone());
				// Only establish a session when a token was actually extracted.
				// A missing/empty token (e.g. the response carried no
				// Authorization header) must not arm the expiry/inactivity timers
				// or store an `undefined` token.
				if (token) {
					const expiry = await authnGetExpiry(response.clone(), token);
					sessionToken = token;
					sessionExpiresAt = now() + expiry;
					inactivityTimer();
					sessionTimer();
				}
				// Always strip Authorization so the token never reaches the page.
				response = deleteHeaderFromResponse(response, authorizationHeader);
			} else if (unauthnPathPattern?.test(request.url)) {
				// Any outcome, network errors included: a logout the server never
				// saw must still stop the token being attached.
				clearSession();
			}
			return response;
		};
	}

	// setTimeout overflows above 2^31-1 ms (~24.8 days) and fires at once, so a
	// far deadline waits in max-length steps until it is in range.
	const timeouts = {};
	const setTimeoutAt = (name, deadline, callback) => {
		clearTimeout(timeouts[name]);
		const delay = deadline - now();
		timeouts[name] =
			// Stryker disable next-line EqualityOperator: at delay === maxTimeout,
			// re-arming after maxTimeout and firing after delay are the same moment.
			delay > maxTimeout
				? setTimeout(() => setTimeoutAt(name, deadline, callback), maxTimeout)
				: setTimeout(callback, Math.max(0, delay));
	};

	// Due 60 sec before the session expires, then held back until 60 sec have
	// passed without activity. Never fires after the session has ended.
	const inactivityTimer = () => {
		setTimeoutAt(
			"inactivity",
			Math.max(
				sessionExpiresAt - inactivityTimeoutBuffer,
				recentActivityTimestamp + inactivityTimeoutBuffer,
			),
			expiryPromptEvent,
		);
	};
	const sessionTimer = () => {
		setTimeoutAt("session", sessionExpiresAt, () => {
			clearSession();
			if (expiryEventType) {
				postMessage({ type: expiryEventType });
			}
		});
	};

	const clearSession = () => {
		sessionToken = "";
		for (const cacheKey of sessionCaches) {
			purgeAuthzEntries(cacheKey).catch(consoleError);
		}
		sessionCaches.clear();
		clearTimeout(timeouts.inactivity);
		clearTimeout(timeouts.session);
	};

	// sw -> Page
	const expiryPromptEvent = () => {
		if (recentActivityTimestamp <= now() - inactivityTimeoutBuffer) {
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

	const destroy = () => {
		clearSession();
	};

	return { before, afterNetwork, after, activityEvent, destroy };
};

const now = () => Date.now();
const maxTimeout = 2 ** 31 - 1;

export const getTokenAuthorization = (response) => {
	// Authorization Bearer <token>
	return response.headers.get(authorizationHeader)?.split(" ")[1];
};

const fromBase64Url = (str) =>
	atob(
		str.replace(/-/g, "+").replace(/_/g, "/") +
			// Stryker disable next-line StringLiteral,ArithmeticOperator: this expression only appends base64 `=` padding; Node's atob decodes byte-identically with or without padding for every length residue (verified empirically), and both mutations ("" / *4) merely drop the padding, yielding the same decoded payload and thus the same parsed expiry — no observable behavior changes in the Node runtime the tests run in.
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
