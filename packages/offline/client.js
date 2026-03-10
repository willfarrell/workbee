export default () => {
	window.addEventListener("online", () => {
		navigator.serviceWorker?.controller?.postMessage({
			type: "online",
		});
	});
};
