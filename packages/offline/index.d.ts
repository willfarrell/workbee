// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
import type { AfterMiddleware } from "@work-bee/core";

export interface SerializedRequest {
	method: string;
	url: string;
	headers: Record<string, string>;
	/**
	 * Serialized body. `null` for GET/HEAD. Text bodies are stored as
	 * `{ encoding: "text", data }`; binary bodies as
	 * `{ encoding: "base64", data }`. A bare string is accepted by
	 * `idbDeserializeRequest` for backward compatibility.
	 */
	body:
		| null
		| string
		| { encoding: "text"; data: string }
		| { encoding: "base64"; data: string };
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
	redactHeaders?: string[];
}

interface OfflineMiddlewareResult {
	afterNetwork: AfterMiddleware;
	postMessageEvent: () => Promise<void>;
	destroy: () => void;
}

declare function offlineMiddleware(
	opts?: OfflineOptions,
): OfflineMiddlewareResult;

export default offlineMiddleware;

export declare function idbSerializeRequest(
	request: Request,
): Promise<SerializedRequest>;

export declare function idbDeserializeRequest(data: SerializedRequest): Request;
