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
	events.forEach((name) => {
		document.addEventListener(
			name,
			() => {
				//console.log(event.type)
				const now = Date.now();
				if (activityTimestamp + 1000 > now) {
					return;
				}
				activityTimestamp = now;

				navigator.serviceWorker?.controller?.postMessage({
					type: "inactivity",
				});
			},
			true,
		);
	});
};
