import { strategyCacheOnly } from "@work-bee/core";

const saveDataMiddleware = ({ saveDataStrategy } = {}) => {
	let originalStrategy;
	const before = (request, _event, config) => {
		originalStrategy = config.strategy;
		const saveData = request.headers.get("Save-Data") === "on";
		if (saveData) {
			config.strategy = saveDataStrategy ?? strategyCacheOnly;
		}
		return request;
	};
	const after = (_request, response, _event, config) => {
		if (originalStrategy) {
			config.strategy = originalStrategy;
			originalStrategy = undefined;
		}
		return response;
	};
	return { before, after };
};
export default saveDataMiddleware;
