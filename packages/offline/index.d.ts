import type { AfterMiddleware } from "@work-bee/core";

export interface SerializedRequest {
	method: string;
	url: string;
	headers: Record<string, string>;
	body: string | null;
	referrer?: string;
	referrerPolicy?: string;
	mode?: string;
	credentials?: string;
	cache?: string;
	integrity?: string;
	keepalive?: boolean;
	redirect?: string;
}

interface OfflineOptions {
	methods?: string[];
	statusCodes?: number[];
	pollDelay?: number;
	postMessage?: (message: any) => Promise<void>;
	enqueueEventType?: string;
	quotaExceededEventType?: string;
	dequeueEventType?: string;
	objectStoreName?: string;
}

interface OfflineMiddlewareResult {
	afterNetwork: AfterMiddleware;
	postMessageEvent: () => Promise<void>;
}

declare function offlineMiddleware(
	opts?: OfflineOptions,
): OfflineMiddlewareResult;

export default offlineMiddleware;

export declare function idbSerializeRequest(
	request: Request,
): Promise<SerializedRequest>;

export declare function idbDeserializeRequest(data: SerializedRequest): Request;
