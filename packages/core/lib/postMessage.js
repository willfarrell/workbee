/* global clients */
export const postMessageToAll = async (message) => {
	return clients
		.matchAll({ includeUncontrolled: true, type: "window" })
		.then((clients) =>
			clients.forEach((client) => {
				client.postMessage(message);
			}),
		);
};

export const postMessageToFocused = async (message) => {
	return clients
		.matchAll({ includeUncontrolled: true, type: "window" })
		.then((clients) => {
			const focused = clients.find((client) => client.focused);
			if (focused) {
				focused.postMessage(message);
			} else if (clients.length) {
				clients[0].postMessage(message);
			}
		});
};
