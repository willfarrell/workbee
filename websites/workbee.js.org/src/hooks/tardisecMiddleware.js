// TODO convert into adapter
import tardisec from "../../.tardisec.json" with { type: "json" };

const tardisecMiddleware = async ({ event, resolve }) => {
	const response = await resolve(event);

	const keys = Object.keys(tardisec.http.headers);
	for (let i = keys.length; i--; ) {
		const headerKey = keys[i];
		const headerValue = tardisec.http.headers[headerKey];
		if (headerValue && !response.headers.has(headerKey)) {
			response.headers.set(headerKey, headerValue);
		}
	}

	response.headers.delete("X-Sveltekit-Page");

	return response;
};

export default tardisecMiddleware;
