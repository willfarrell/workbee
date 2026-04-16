// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
const defaultActivityEvents = [
	"load",

	"keypress",
	"mousedown",
	"mousemove",
	"scroll",
	"touchmove",
	"touchstart",
	"visibilitychange",
	"wheel",
];

export default (events = defaultActivityEvents) => {
	let activityTimestamp = 0;
	const handlers = [];
	events.forEach((name) => {
		const handler = () => {
			const now = Date.now();
			if (activityTimestamp + 1000 > now) {
				return;
			}
			activityTimestamp = now;

			navigator.serviceWorker?.controller?.postMessage({
				type: "inactivity",
			});
		};
		document.addEventListener(name, handler, true);
		handlers.push({ name, handler });
	});
	return () => {
		for (const { name, handler } of handlers) {
			document.removeEventListener(name, handler, true);
		}
	};
};
