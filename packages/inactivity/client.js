// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
const defaultActivityEvents = [
	"load",

	"keydown",
	"mousedown",
	"mousemove",
	"scroll",
	"touchmove",
	"touchstart",
	"visibilitychange",
	"wheel",
];

// Passive: activity listeners never call preventDefault, so scroll/touch stay
// smooth.
const listenerOptions = { capture: true, passive: true };

// Sent by the ServiceWorker middleware when a request starts or finishes.
const activityEventType = "inactivity-activity";

// Shares DOM activity between tabs; SW messages already reach every tab.
const channelName = "@work-bee/inactivity";
const broadcastIntervalMs = 1000;

const defaultInactivityEvent = () =>
	console.warn(
		"@work-bee/inactivity: inactivity threshold reached but no `inactivityEvent` callback was provided",
	);

// The countdown lives in the page, not the ServiceWorker: an idle worker is
// terminated after ~30s, taking any long setTimeout with it.
export default ({
	inactivityAllowedInMin = 15,
	inactivityEvent = defaultInactivityEvent,
	events = defaultActivityEvents,
} = {}) => {
	const inactivityAllowedInMs = Math.floor(inactivityAllowedInMin * 60 * 1000);
	let activityTimestamp;
	let timeout;
	// Activity only records a timestamp (mousemove fires constantly); the timer
	// re-arms itself for whatever is left of the window when it wakes early.
	const check = () => {
		const remaining = activityTimestamp + inactivityAllowedInMs - Date.now();
		if (remaining > 0) {
			timeout = setTimeout(check, remaining);
			return;
		}
		timeout = undefined;
		inactivityEvent();
	};
	const activity = () => {
		activityTimestamp = Date.now();
		timeout ??= setTimeout(check, inactivityAllowedInMs);
	};
	const channel = new BroadcastChannel(channelName);
	channel.onmessage = activity;
	let broadcastTimestamp = -Infinity;
	// Throttled: mousemove would otherwise flood every other tab.
	const localActivity = () => {
		activity();
		if (activityTimestamp - broadcastTimestamp >= broadcastIntervalMs) {
			broadcastTimestamp = activityTimestamp;
			channel.postMessage(null);
		}
	};
	const message = (event) => {
		if (event.data?.type === activityEventType) activity();
	};

	for (const name of events) {
		document.addEventListener(name, localActivity, listenerOptions);
	}
	navigator.serviceWorker?.addEventListener("message", message);
	activity();

	return () => {
		clearTimeout(timeout);
		channel.close();
		for (const name of events) {
			document.removeEventListener(name, localActivity, listenerOptions);
		}
		navigator.serviceWorker?.removeEventListener("message", message);
	};
};
