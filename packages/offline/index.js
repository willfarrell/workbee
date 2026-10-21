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
	failedEventType,
	databaseName,
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
	// One database per queue by default: onupgradeneeded only fires when a
	// database is first created, so a second store added to an existing database
	// would never be created. The default queue keeps its original "sw" database.
	databaseName ??=
		objectStoreName === "offline" ? "sw" : `sw-${objectStoreName}`;
	redactHeaders ??= [
		"authorization",
		"cookie",
		"set-cookie",
		"proxy-authorization",
	];

	// `fetch(request)` consumes the request body, so by the time `afterNetwork`
	// runs the original request can no longer be cloned (and thus not serialized
	// for the queue). Capture a clone in `beforeNetwork` — the last hook before
	// the network touches the body — keyed by `event` (the stable per-request
	// handle). The WeakMap entry is reclaimed automatically with the event.
	const pendingClones = new WeakMap();
	const beforeNetwork = (request, event, _config) => {
		// Only queue-eligible methods can ever need their body replayed;
		// skip the clone (and WeakMap write) for everything else (e.g. GET).
		if (methods.includes(request.method)) {
			pendingClones.set(event, request.clone());
		}
		return request;
	};

	// Enqueue and Retry submitted data
	const afterNetwork = async (request, response, event, _config) => {
		if (!methods.includes(request.method)) {
			return response;
		}
		if (isResponse(response) && !statusCodes.includes(response.status)) {
			return response;
		}

		// Prefer the pre-network clone (intact body). Fall back to `request` for
		// callers that drive `afterNetwork` directly without a network round-trip
		// (e.g. unit tests), where the body has not been consumed.
		const queued = enqueue(pendingClones.get(event) ?? request);
		event.waitUntil(queued);
		// Only claim 202 Accepted once the request is actually stored.
		try {
			await queued;
		} catch {
			return response;
		}
		return newResponse({ status: 202 });
	};

	// At most one poll pending; postMessageEvent and destroy reset `timer`.
	let timer;
	const timeout = () => {
		if (pollDelay > 0) {
			timer ??= setTimeout(postMessageEvent, pollDelay);
		}
	};

	let idbDatabase;
	const idbOpenRequest = indexedDB.open(databaseName, 1);
	let dbError;
	const dbReady = new Promise((resolve, reject) => {
		const fail = (e) => {
			consoleError(e);
			dbError = e;
			reject(e);
		};
		idbOpenRequest.onerror = fail;
		idbOpenRequest.onupgradeneeded = () => {
			idbDatabase ??= idbOpenRequest.result;
			idbDatabase.createObjectStore(objectStoreName, { autoIncrement: true });
		};
		idbOpenRequest.onsuccess = () => {
			idbDatabase ??= idbOpenRequest.result;
			if (!idbDatabase.objectStoreNames.contains(objectStoreName)) {
				fail(
					new Error(
						`offlineMiddleware: object store "${objectStoreName}" does not exist in database "${databaseName}", which was created for another queue. Give each objectStoreName its own databaseName.`,
					),
				);
				return;
			}
			resolve();
		};
	});
	// A queue left by an earlier worker has no poll pending, and a worker that
	// restarts while online never gets an `online` event, so resume it here.
	dbReady
		.then(() => peek("next"))
		.then((head) => head && timeout())
		.catch(() => {});

	// Runs `work(store)` inside a fresh transaction. Each call to enqueue /
	// postMessageEvent gets its own transaction, so concurrent callers cannot
	// clobber each other's cursor/objectStore state.
	const withStore = async (mode, work) => {
		// Stryker disable next-line ConditionalExpression: equivalent. `dbError` is
		// assigned only inside `idbOpenRequest.onerror`, which in the SAME callback
		// also rejects `dbReady` with the identical value. So whenever `dbError` is
		// truthy, `dbReady` is already rejected with that value; removing this
		// fast-path (`if (false)`) simply falls through to `await dbReady`, which
		// rejects with the same error. No assertion can observe the difference.
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

	// Reads one end of the queue (key + value) in its own transaction.
	// "next" = oldest, the replay order; "prev" = newest, what enqueue dedupes
	// against. Keys are autoIncrement, so cursor order is insertion order.
	const peek = (direction) =>
		withStore(
			"readonly",
			(store) =>
				new Promise((resolve, reject) => {
					const req = store.openCursor(null, direction);
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

	const eventPayload = (type, serialized) => {
		const { body: _body, ...metadata } = serialized;
		return { type, ...metadata };
	};

	const enqueue = async (request) => {
		const serialized = await idbSerializeRequest(request);
		for (const header of redactHeaders) {
			delete serialized.headers[header.toLowerCase()];
		}
		// Compare against the newest entry: this suppresses an accidental double
		// submit of the same request, while still queueing a genuine re-submit
		// that happened after some other request.
		const tail = await peek("prev");
		if (JSON.stringify(tail?.value) === JSON.stringify(serialized)) {
			return;
		}
		try {
			await addEntry(serialized);
		} catch (e) {
			consoleError(e);
			if (e.name === "QuotaExceededError" && quotaExceededEventType) {
				postMessage({ type: quotaExceededEventType });
			}
			throw e;
		}
		// Only notify after the IDB write has actually succeeded.
		if (enqueueEventType) {
			postMessage(eventPayload(enqueueEventType, serialized));
		}
		timeout();
	};

	// Permanent failure: drop the entry so it can't block the rest of the queue.
	const evict = async (head) => {
		await deleteByKey(head.key);
		if (failedEventType) {
			postMessage(eventPayload(failedEventType, head.value));
		}
	};

	let draining = false;
	// Trigger when client is online
	const postMessageEvent = async () => {
		clearTimeout(timer);
		timer = undefined;
		if (!navigator.onLine) {
			return timeout();
		}
		if (draining) {
			return;
		}
		draining = true;
		try {
			while (navigator.onLine) {
				const head = await peek("next");
				// Drained: stop polling until the next enqueue arms it again. Only
				// the offline / retryable / error exits below re-arm the timer.
				if (!head) return;
				let replay;
				try {
					replay = idbDeserializeRequest(head.value);
				} catch (e) {
					// It can never be rebuilt, so retrying would wedge the queue.
					consoleError(e);
					await evict(head);
					continue;
				}
				const response = await fetch(replay);
				// A queued form POST keeps redirect "manual", so the server's
				// post-submit redirect comes back as an opaqueredirect (status 0).
				if (response.ok || response.type === "opaqueredirect") {
					// 2xx (or redirect) — replayed successfully, dequeue and continue.
					await deleteByKey(head.key);
					if (dequeueEventType) {
						postMessage(eventPayload(dequeueEventType, head.value));
					}
					continue;
				}
				if (statusCodes.includes(response.status)) {
					break;
				}
				await evict(head);
			}
		} catch (e) {
			consoleError(e);
		} finally {
			draining = false;
		}
		timeout();
	};

	const destroy = () => {
		clearTimeout(timer);
		timer = undefined;
		idbDatabase?.close();
	};

	// Queued requests replay with whatever cookies are current at replay time,
	// so drop them when the user changes (call on logout).
	const clear = async () => {
		clearTimeout(timer);
		timer = undefined;
		await withStore("readwrite", (store) => {
			store.clear();
		});
	};

	return { beforeNetwork, afterNetwork, postMessageEvent, destroy, clear };
};

export default offlineMiddleware;

// *** IndexedDB *** //
// Protects against the browser closing for offline queues and retries
//
// SECURITY: Request bodies and headers are persisted to IndexedDB. If requests
// contain PII, auth tokens, or payment data, this data will be stored on disk
// unencrypted. Sensitive headers are redacted via `redactHeaders` option (defaults
// to stripping "authorization", "cookie", "set-cookie", "proxy-authorization"),
// but request bodies are stored as-is. Avoid the offline queue for routes whose
// request bodies carry sensitive data. Stripping credential headers does NOT
// make replay unauthenticated: with cookie auth the browser attaches whatever
// cookies are current at replay time, so a request queued by one user can land
// in the next user's session. Call `clear()` on logout.

const textContentType = (ct) =>
	!ct ||
	ct.startsWith("text/") ||
	ct.startsWith("application/json") ||
	ct.startsWith("application/javascript") ||
	ct.startsWith("application/xml") ||
	// Stryker disable next-line MethodExpression: equivalent. Any `ct` that would
	// make `startsWith("application/xhtml+xml")` true (or for which the mutated
	// `endsWith(...)` would matter) necessarily contains the substring "+xml", so
	// the later `ct.includes("+xml")` clause already returns true for it. Swapping
	// startsWith->endsWith here can never change the overall OR result.
	ct.startsWith("application/xhtml+xml") ||
	ct.includes("+json") ||
	ct.includes("+xml");

const base64ChunkSize = 0x2000;
const bytesToBase64 = (bytes) => {
	let binary = "";
	// One fromCharCode call per chunk instead of per byte; per-byte string
	// concatenation is quadratic-ish on large bodies. The chunk size stays well
	// under the engine's argument-count limit.
	// Stryker disable next-line EqualityOperator: equivalent. `<=` runs one
	// extra iteration whose subarray is empty; fromCharCode() of zero args is
	// "", so the encoded output is byte-identical.
	for (let i = 0; i < bytes.length; i += base64ChunkSize) {
		binary += String.fromCharCode.apply(
			null,
			bytes.subarray(i, i + base64ChunkSize),
		);
	}
	return btoa(binary);
};

const base64ToBytes = (base64) => {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	// Stryker disable next-line EqualityOperator: equivalent. Changing `<` to `<=`
	// runs one extra iteration at `i === binary.length`, which writes
	// `bytes[binary.length] = binary.charCodeAt(binary.length)`. `charCodeAt` past
	// the end returns NaN, and writing to an out-of-bounds index of a fixed-length
	// Uint8Array is a silent no-op. The decoded bytes are therefore byte-identical,
	// so no assertion can distinguish the two loops.
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
};

// A queued HTML form POST has mode "navigate", which the Request constructor
// rejects on replay; a replayed request is same-origin.
const replayMode = (mode) => (mode === "navigate" ? "same-origin" : mode);

export const idbSerializeRequest = async (request) => {
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
	if (properties.mode) properties.mode = replayMode(properties.mode);
	const headers = headersGetAll(request.headers);
	let body = null;
	// Firefox does not implement `Request.body` (always undefined), so it cannot
	// tell us whether there is a body. Decide by method instead; `null` is the
	// spec's "no body" in browsers that do implement it.
	if (
		request.body !== null &&
		request.method !== "GET" &&
		request.method !== "HEAD"
	) {
		const cloned = request.clone();
		if (textContentType(headers["content-type"])) {
			body = { encoding: "text", data: await cloned.text() };
		} else {
			const bytes = new Uint8Array(await cloned.arrayBuffer());
			body = { encoding: "base64", data: bytesToBase64(bytes) };
		}
	}
	return {
		...properties,
		headers,
		body,
	};
};

export const idbDeserializeRequest = (data) => {
	let body = data.body;
	if (body && typeof body === "object" && typeof body.encoding === "string") {
		body = body.encoding === "base64" ? base64ToBytes(body.data) : body.data;
	}
	return newRequest(data.url, { ...data, mode: replayMode(data.mode), body });
};
