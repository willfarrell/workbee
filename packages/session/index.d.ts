// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
import type { AfterMiddleware, BeforeMiddleware } from "@work-bee/core";

interface SessionOptions {
	authnMethods?: string[];
	/** Only read from the SW origin or `authzAllowedOrigins`. */
	authnPathPattern?: RegExp;
	/** Return a falsy value when the response carries no token. */
	authnGetToken?: (
		response: Response,
	) => string | undefined | Promise<string | undefined>;
	authnGetExpiry?: (
		response: Response,
		token: string,
	) => number | Promise<number>;
	authzPathPattern?: RegExp;
	authzSetToken?: (request: Request, token: string) => Request;
	authzAllowedOrigins?: string[];
	/** Posted 60 s before expiry, once 60 s have passed without activity. */
	inactivityPromptEventType?: string;
	postMessage?: (message: any) => Promise<void>;
	/** Clears the session on any outcome, network errors included. */
	unauthnPathPattern?: RegExp;
	expiryEventType?: string;
}

interface SessionMiddlewareResult {
	before?: BeforeMiddleware;
	afterNetwork?: AfterMiddleware;
	after?: AfterMiddleware;
	activityEvent: () => void;
	destroy: () => void;
}

declare function sessionMiddleware(
	opts: SessionOptions,
): SessionMiddlewareResult;

export default sessionMiddleware;

export declare function getTokenAuthorization(
	response: Response,
): string | undefined;

export declare function getExpiryJWT(response: Response, token: string): number;

export declare function getExpiryPaseto(
	response: Response,
	token: string,
): number;

export declare function setTokenAuthorization(
	request: Request,
	token: string,
): Request;
