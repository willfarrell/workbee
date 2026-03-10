import {
	fetchInlineStrategy,
	isResponse,
	newRequest,
	strategyCacheFirst,
} from "@work-bee/core";

const fallbackMiddleware = ({
	pathPattern,
	path,
	statusCodes,
	fallbackStrategy,
} = {}) => {
	const after = async (request, response, event, config) => {
		if (response?.ok) {
			return response;
		}
		const typeResponse = isResponse(response);
		if (typeResponse && !statusCodes?.includes(response.status)) {
			return response;
		}
		let url = path;
		if (pathPattern) {
			url = request.url.replace(pathPattern, path);
		}
		if (typeResponse) {
			url = url.replace("{status}", response.status);
		}
		return fetchInlineStrategy(newRequest(url, request), event, {
			...config,
			strategy: fallbackStrategy ?? strategyCacheFirst,
		});
	};
	return { after };
};
export default fallbackMiddleware;
