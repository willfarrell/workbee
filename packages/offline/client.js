// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
export default () => {
	window.addEventListener("online", () => {
		navigator.serviceWorker?.controller?.postMessage({
			type: "online",
		});
	});
};
