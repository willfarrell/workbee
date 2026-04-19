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

	let timer;
	const timeout = () => {
		if (pollDelay > 0) {
			timer = setTimeout(postMessageEvent, pollDelay);
		}
	};

	let idbDatabase;
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

	// Runs `work(store)` inside a fresh transaction. Each call to enqueue /
	// postMessageEvent gets its own transaction, so concurrent callers cannot
	// clobber each other's cursor/objectStore state.
	const withStore = async (mode, work) => {
		if (dbError) throw dbError;
		await dbReady;
		const tx = idbDatabase.transaction([objectStoreName], mode);
		const store = tx.objectStore(objectStoreName);
		const done = new Promise((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onabort = () => reject(tx.error);
			tx.onerror = () => reject(tx.error);
		});
		const result = await work(store);
		await done;
		return result;
	};

	// Reads the oldest queued entry (key + value) in its own transaction.
	const peekHead = () =>
		withStore(
			"readonly",
			(store) =>
				new Promise((resolve, reject) => {
					const req = store.openCursor();
					req.onsuccess = (e) => {
						const cursor = e?.target?.result;
						resolve(cursor ? { key: cursor.key, value: cursor.value } : null);
					};
					req.onerror = (e) => reject(e?.target?.error);
				}),
		);

	const deleteByKey = (key) =>
		withStore("readwrite", (store) => {
			store.delete(key);
		});

	const addEntry = (entry) =>
		withStore("readwrite", (store) => {
			store.add(entry);
		});

	const enqueue = async (request) => {
		const serialized = await idbSerializeRequest(request);
		for (const header of redactHeaders) {
			delete serialized.headers[header.toLowerCase()];
		}
		// Avoid enqueuing an exact duplicate of the current head
		const head = await peekHead();
		if (JSON.stringify(head?.value) === JSON.stringify(serialized)) {
			return;
		}
		if (enqueueEventType) {
			postMessage({ type: enqueueEventType, ...serialized });
		}
		try {
			await addEntry(serialized);
		} catch (e) {
			consoleError(e);
			if (e.name === "QuotaExceededError" && quotaExceededEventType) {
				postMessage({ type: quotaExceededEventType });
			}
		}
		if (!head) {
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
			const head = await peekHead();
			if (head) {
				const response = await fetch(idbDeserializeRequest(head.value));
				if (!statusCodes.includes(response.status)) {
					await deleteByKey(head.key);
					if (dequeueEventType) {
						postMessage({ type: dequeueEventType, ...head.value });
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
