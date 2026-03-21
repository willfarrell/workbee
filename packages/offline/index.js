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
	idbOpenRequest.onerror = (e) => {
		consoleError(e);
	};
	idbOpenRequest.onupgradeneeded = () => {
		idbDatabase ??= idbOpenRequest.result;
		idbDatabase.createObjectStore(objectStoreName, { autoIncrement: true });
	};
	idbOpenRequest.onsuccess = () => {
		idbDatabase ??= idbOpenRequest.result;
	};

	const idbCursor = () =>
		new Promise((resolve, reject) => {
			idbStartTransaction();
			const request = idbObjectStore.openCursor();
			request.onsuccess = (event) => resolve(event?.target?.result);
			request.onerror = (event) => reject(event?.target?.error);
		});

	const idbStartTransaction = () => {
		if (!idbDatabase) {
			throw new Error("IndexedDB not initialized");
		}
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
			idbStartTransaction();
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
			} else {
				timeout();
			}
		}
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
// Storing requests in IndexedDB has risks of exposing PII

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
