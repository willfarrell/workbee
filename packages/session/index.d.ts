import type { AfterMiddleware, BeforeMiddleware } from "@work-bee/core";

interface SessionOptions {
	authnMethods?: string[];
	authnPathPattern?: RegExp;
	authnGetToken?: (response: Response) => string | Promise<string>;
	authnGetExpiry?: (
		response: Response,
		token: string,
	) => number | Promise<number>;
	authzPathPattern?: RegExp;
	authzSetToken?: (request: Request, token: string) => Request;
	inactivityPromptEventType?: string;
	postMessage?: (message: any) => Promise<void>;
	unauthnPathPattern?: RegExp;
	expiryEventType?: string;
}

interface SessionMiddlewareResult {
	before?: BeforeMiddleware;
	afterNetwork?: AfterMiddleware;
	after?: AfterMiddleware;
	activityEvent: () => void;
}

declare function sessionMiddleware(
	opts: SessionOptions,
): SessionMiddlewareResult;

export default sessionMiddleware;

export declare function getTokenAuthorization(response: Response): string;

export declare function getExpiryJWT(response: Response, token: string): number;

export declare function getExpiryPaseto(
	response: Response,
	token: string,
): number;

export declare function setTokenAuthorization(
	request: Request,
	token: string,
): Request;
