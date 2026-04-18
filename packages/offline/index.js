// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
/* global indexedDB */
import {
	consoleError,
	deleteMethod,
	headersGetAll,
	isResponse,
	newRequest,
	newResponse,
	patchMethod,
	postMessageToFocused,
	postMethod,
	putMethod,
} from "@work-bee/core";

const offlineMiddleware = ({
	methods,
	statusCodes,
	pollDelay,
	postMessage,
	enqueueEventType,
	quotaExceededEventType,
	dequeueEventType,
	objectStoreName,
	redactHeaders,
} = {}) => {
	statusCodes ??= [
		503, // Service Unavailable
		504, // Gateway Timeout
	];
	pollDelay ??= 1 * 60 * 1000;
	postMessage ??= postMessageToFocused;
	methods ??= [postMethod, putMethod, patchMethod, deleteMethod];
	objectStoreName ??= "offline";
	redactHeaders ??= [
		"authorization",
		"cookie",
		"set-cookie",
		"proxy-authorization",
	];

	// Enqueue and Retry submitted data
	const afterNetwork = async (request, response, event, _config) => {
		if (!methods.includes(request.method)) {
			return response;
		}
		if (isResponse(response) && !statusCodes.includes(response.status)) {
			return response;
		}

		event.waitUntil(enqueue(request));

		return newResponse({ status: 202 });
	};

	let cursor, timer;
	const timeout = () => {
		if (pollDelay > 0) {
			timer = setTimeout(postMessageEvent, pollDelay);
		}
	};

	let idbDatabase, idbTransaction, idbObjectStore;
	const idbOpenRequest = indexedDB.open("sw", 1);
	let dbError;
	const dbReady = new Promise((resolve, reject) => {
		idbOpenRequest.onerror = (e) => {
			consoleError(e);
			dbError = e;
			reject(e);
		};
		idbOpenRequest.onupgradeneeded = () => {
			idbDatabase ??= idbOpenRequest.result;
			idbDatabase.createObjectStore(objectStoreName, { autoIncrement: true });
		};
		idbOpenRequest.onsuccess = () => {
			idbDatabase ??= idbOpenRequest.result;
			resolve();
		};
	});
	dbReady.catch(() => {});

	const idbCursor = async () => {
		await idbStartTransaction();
		return new Promise((resolve, reject) => {
			const request = idbObjectStore.openCursor();
			request.onsuccess = (event) => resolve(event?.target?.result);
			request.onerror = (event) => reject(event?.target?.error);
		});
	};

	const idbStartTransaction = async () => {
		if (dbError) throw dbError;
		await dbReady;
		idbTransaction = idbDatabase.transaction([objectStoreName], "readwrite");
		idbObjectStore = idbTransaction.objectStore(objectStoreName);
	};

	const enqueue = async (request) => {
		const serialized = await idbSerializeRequest(request);
		for (const header of redactHeaders) {
			delete serialized.headers[header.toLowerCase()];
		}
		// Catch attempts to add in a duplicate
		cursor = await idbCursor();
		if (JSON.stringify(cursor?.value) !== JSON.stringify(serialized)) {
			if (enqueueEventType) {
				postMessage({ type: enqueueEventType, ...serialized });
			}
			await idbStartTransaction();
			try {
				idbObjectStore.add(serialized);
			} catch (e) {
				consoleError(e);
				// https://github.com/dumbmatter/fakeIndexedDB/issues/51
				if (e.name === "QuotaExceededError") {
					if (quotaExceededEventType) {
						postMessage({ type: quotaExceededEventType });
					}
				}
				// TODO backoff timer to retry add
				// idbObjectStore.add(serialized)
			}
		}
		if (!cursor) {
			timeout();
		}
	};

	// Trigger when client is online
	const postMessageEvent = async () => {
		clearTimeout(timer);
		if (!navigator.onLine) {
			return timeout();
		}
		try {
			cursor = await idbCursor();
			if (cursor) {
				const value = cursor.value;
				const response = await fetch(idbDeserializeRequest(value));
				if (!statusCodes.includes(response.status)) {
					cursor.delete();
					if (dequeueEventType) {
						postMessage({ type: dequeueEventType, ...value });
					}
					return postMessageEvent();
				}
			}
		} catch (e) {
			consoleError(e);
		}
		timeout();
	};

	const destroy = () => {
		clearTimeout(timer);
		idbDatabase?.close();
	};

	return { afterNetwork, postMessageEvent, destroy };
};

export default offlineMiddleware;

// *** IndexedDB *** //
// Protects against the browser closing for offline queues and retries
//
// SECURITY: Request bodies and headers are persisted to IndexedDB. If requests
// contain PII, auth tokens, or payment data, this data will be stored on disk
// unencrypted. Sensitive headers are redacted via `redactHeaders` option (defaults
// to stripping Authorization), but request bodies are stored as-is. Callers
// handling sensitive body data should implement a custom `redactBody` strategy
// or avoid using the offline queue for those routes.

export const idbSerializeRequest = async (request) => {
	// TODO test using ...request instead
	const properties = {};
	for (const property of [
		"method",
		"url",
		"referrer",
		"referrerPolicy",
		"mode",
		"credentials",
		"cache",
		"integrity",
		"keepalive",
		"redirect",
	]) {
		if (request[property] !== undefined) {
			properties[property] = request[property];
		}
	}
	const body = request.body && (await request.clone().text());
	const headers = headersGetAll(request.headers);
	return {
		...properties,
		headers,
		body,
	};
};

export const idbDeserializeRequest = (data) => {
	return newRequest(data.url, data);
};
