// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
export default () => {
	const handler = () => {
		navigator.serviceWorker?.controller?.postMessage({
			type: "online",
		});
	};
	window.addEventListener("online", handler);
	return () => {
		window.removeEventListener("online", handler);
	};
};
