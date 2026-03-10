const defaults = {
	inactivityAllowedInMin: 15,
	inactivityEvent: () =>
		console.error("@work-bee/inactivity inactivityEvent not set"),
};

const inactivityMiddleware = (opts) => {
	let requestCount = 0;
	const { inactivityAllowedInMin, inactivityEvent } = {
		...defaults,
		...opts,
	};
	const inactivityAllowedInMs = Math.floor(inactivityAllowedInMin * 60 * 1000);
	let inactivityTimeout;
	const resetInactivityTimeout = (duration) => {
		clearTimeout(inactivityTimeout);
		if (!requestCount) {
			inactivityTimeout = setTimeout(() => {
				inactivityEvent();
			}, duration);
		}
	};

	const before = (request, _event, _config) => {
		clearTimeout(inactivityTimeout);
		requestCount += 1;
		return request;
	};
	const after = (_request, response, _event, _config) => {
		requestCount -= 1;
		resetInactivityTimeout(inactivityAllowedInMs);
		return response;
	};
	// Page -> sw
	// Trigger when client is active
	const postMessageEvent = () => {
		resetInactivityTimeout(inactivityAllowedInMs);
	};
	resetInactivityTimeout(inactivityAllowedInMs);
	return { before, after, postMessageEvent };
};

export default inactivityMiddleware;
