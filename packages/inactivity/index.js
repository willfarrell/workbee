// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
import { consoleError, postMessageToAll } from "@work-bee/core";

// Must match the type `@work-bee/inactivity/client` listens for.
const activityMessage = { type: "inactivity-activity" };
const throttleInMs = 1000;

// The inactivity countdown runs in the page (see client.js): an idle
// ServiceWorker is terminated after ~30s, so a timer here would never fire.
// This middleware only tells the pages that network activity happened.
const inactivityMiddleware = ({ postMessage = postMessageToAll } = {}) => {
	let notifiedTimestamp = -Infinity;
	const notify = () => {
		const now = Date.now();
		if (now - notifiedTimestamp < throttleInMs) return;
		notifiedTimestamp = now;
		postMessage(activityMessage).catch(consoleError);
	};

	const before = (request, _event, _config) => {
		notify();
		return request;
	};
	const after = (_request, response, _event, _config) => {
		notify();
		return response;
	};
	return { before, after };
};

export default inactivityMiddleware;
