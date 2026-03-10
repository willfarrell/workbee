import { strategyCacheOnly } from "@work-bee/core";

const saveDataMiddleware = ({ saveDataStrategy } = {}) => {
	const originalStrategies = new WeakMap();
	const before = (request, event, config) => {
		originalStrategies.set(event, config.strategy);
		const saveData = request.headers.get("Save-Data") === "on";
		if (saveData) {
			config.strategy = saveDataStrategy ?? strategyCacheOnly;
		}
		return request;
	};
	const after = (_request, response, event, config) => {
		const originalStrategy = originalStrategies.get(event);
		if (originalStrategy) {
			config.strategy = originalStrategy;
			originalStrategies.delete(event);
		}
		return response;
	};
	return { before, after };
};
export default saveDataMiddleware;
