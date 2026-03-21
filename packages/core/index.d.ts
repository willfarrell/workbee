// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
// --- Interfaces ---

/** Strategy function signature for handling fetch requests. */
export type Strategy = (
	request: Request,
	event: ExtendableEvent,
	config: RouteConfig,
) => Promise<Response> | Response;

/** Middleware applied before the strategy executes. */
export type BeforeMiddleware = (
	request: Request,
	event: ExtendableEvent,
	config: RouteConfig,
) => Request | Promise<Request>;

/** Middleware applied after the strategy executes. */
export type AfterMiddleware = (
	request: Request,
	response: Response | Error,
	event: ExtendableEvent,
	config: RouteConfig,
) => Response | Error | Promise<Response | Error>;

/** Middleware object with optional lifecycle hooks. */
export interface Middleware {
	before?: BeforeMiddleware;
	beforeNetwork?: BeforeMiddleware;
	afterNetwork?: AfterMiddleware;
	after?: AfterMiddleware;
}

/** Configuration for an individual route. */
export interface RouteConfig {
	cacheKey: string;
	cachePrefix: string;
	cacheName: string;
	cacheControlMaxAge: number;
	methods: string[];
	strategy: Strategy;
	pathPattern: RegExp;
	middlewares: Middleware[];
	before: BeforeMiddleware[];
	beforeNetwork: BeforeMiddleware[];
	afterNetwork: AfterMiddleware[];
	after: AfterMiddleware[];
}

/** Top-level service worker configuration. */
export interface WorkBeeConfig extends RouteConfig {
	precache: PrecacheConfig;
	activate: ActivateConfig;
	routes: RouteConfig[];
}

export interface PrecacheConfig extends RouteConfig {
	routes: (PrecacheRouteConfig | string)[];
	eventType: string | false;
	postMessage: (message: any) => Promise<void>;
	extract?: (response: Response) => any[] | Promise<any[]>;
}

export interface PrecacheRouteConfig extends RouteConfig {
	path: string;
}

export interface ActivateConfig {
	eventType: string | false;
	postMessage: (message: any) => Promise<void>;
}

/** Options for partition strategies. */
export interface PartitionOptions {
	routes?: PartitionRouteConfig[];
	makeRequest?: (
		request: Request,
		config: RouteConfig,
		routeConfig: PartitionRouteConfig,
	) => Request;
	strategy?: Strategy;
}

export interface PartitionRouteConfig {
	path: string;
	[key: string]: any;
}

// --- lib/cache.js ---

/** Mutable object tracking opened caches. */
export const openCaches: Record<string, Cache>;

/** Returns a handler that overrides cached responses via postMessage events. */
export function cacheOverrideEvent(
	config: WorkBeeConfig,
): (messageEvent: {
	request: string | Request;
	response: string | Response;
}) => Promise<void>;

/** Puts a response into the named cache, retrying on quota errors. */
export function cachePut(
	cacheKey: string,
	request: Request,
	response: Response,
	retry?: number,
): Promise<void>;

/** Returns whether the response's Expires header is in the past, or undefined if no response. */
export function cacheExpired(
	response: Response | undefined,
): boolean | undefined;

/** Deletes expired entries from a specific cache. */
export function cacheDeleteExpired(cacheKey: string): Promise<void>;

/** Deletes expired entries from all caches. */
export function cachesDeleteExpired(): Promise<undefined[]>;

/** Deletes all caches except those in the exclude list. */
export function cachesDelete(exclude?: string[]): Promise<boolean[]>;

// --- lib/config.js ---

/** Converts a path pattern string to a RegExp. */
export function pathPattern(pathPattern: string): RegExp;

/** Default configuration values. */
export const defaultConfig: WorkBeeConfig;

/** Compiles a partial configuration into a fully resolved WorkBeeConfig. */
export function compileConfig(config: Partial<WorkBeeConfig>): WorkBeeConfig;

// --- lib/console.js ---

/** Bound reference to console.log. */
export const consoleLog: typeof console.log;

/** Bound reference to console.error. */
export const consoleError: typeof console.error;

// --- lib/events.js ---

/** Handles the service worker install event. */
export function eventInstall(
	event: ExtendableEvent,
	config: WorkBeeConfig,
): void;

/** Extracts a JSON array from a response for use in precaching. */
export function precacheExtractJSON(response: Response): any[] | Promise<any[]>;

/** Handles the service worker activate event. */
export function eventActivate(
	event: ExtendableEvent,
	config: WorkBeeConfig,
): void;

/** Handles the service worker fetch event. */
export function eventFetch(event: FetchEvent, config: WorkBeeConfig): void;

/** Finds the matching RouteConfig for a given request. */
export function findRouteConfig(
	config: WorkBeeConfig,
	request: Request,
): RouteConfig;

/** Fetches using a strategy with inline waitUntil processing. */
export function fetchInlineStrategy(
	request: Request,
	event: ExtendableEvent,
	config: RouteConfig,
): Promise<Response>;

/** Fetches using the configured strategy with before/after middleware. */
export function fetchStrategy(
	request: Request,
	event: ExtendableEvent,
	config: RouteConfig,
): Promise<Response>;

/** Handles the periodic background sync event. */
export function periodicSyncEvent(event: Event): void;

/** Handles push notification events. */
export function pushEvent(
	event: Event,
	options: { init: () => void; shutdown: () => void },
): void;

/** Handles notification click events. */
export function notificationClickEvent(event: Event): void;

/** Handles successful background fetch events. */
export function backgroundFetchSuccessEvent(event: Event): void;

/** Handles failed background fetch events. */
export function backgroundFetchFailEvent(event: Event): void;

// --- lib/http.js ---

/** Extracts all headers from a Headers object into a plain record. */
export function headersGetAll(
	headersObj: Headers | undefined,
): Record<string, string>;

/** Removes the hash fragment from a URL string. */
export function urlRemoveHash(url: string): string;

/** Type guard that checks if a value is a Request instance. */
export function isRequest(value: unknown): value is Request;

/** Creates a new Request. */
export function newRequest(
	url: string | Request,
	options?: RequestInit,
): Request;

/** Returns a new Request with an additional header set. */
export function addHeaderToRequest(
	request: Request,
	key: string,
	value: string,
): Request;

/** Type guard that checks if a value is a Response instance. */
export function isResponse(value: unknown): value is Response;

/** Creates a new Response with optional status, url, body, and headers. */
export function newResponse(
	options: { status?: number; url?: string; body?: BodyInit | null },
	headersObj?: Headers | Record<string, string>,
): Response;

/** Returns a new Response with an additional header set. */
export function addHeaderToResponse(
	response: Response,
	key: string,
	value: string,
): Response;

/** Returns a new Response with the specified header removed. */
export function deleteHeaderFromResponse(
	response: Response,
	key: string,
): Response;

export const getMethod: "GET";
export const postMethod: "POST";
export const putMethod: "PUT";
export const patchMethod: "PATCH";
export const deleteMethod: "DELETE";
export const headMethod: "HEAD";
export const optionsMethod: "OPTIONS";

export const authorizationHeader: "Authorization";

// --- lib/postMessage.js ---

/** Posts a message to all controlled window clients. */
export function postMessageToAll(message: any): Promise<void>;

/** Posts a message to the focused window client, or the first available. */
export function postMessageToFocused(message: any): Promise<void>;

// --- lib/strategies.js ---

/** Network-only strategy: always fetches from the network. */
export const strategyNetworkOnly: Strategy;

/** Cache-only strategy: only returns cached responses. */
export const strategyCacheOnly: Strategy;

/** Network-first strategy: tries network, falls back to cache. */
export const strategyNetworkFirst: Strategy;

/** Cache-first strategy: tries cache, falls back to network. */
export const strategyCacheFirst: Strategy;

/** Stale-while-revalidate strategy: returns cache and revalidates in background. */
export const strategyStaleWhileRevalidate: Strategy;

/** Ignore strategy: returns a 408 response. */
export const strategyIgnore: Strategy;

/** Cache-first-ignore strategy: tries cache, returns 408 if not cached. */
export const strategyCacheFirstIgnore: Strategy;

/** Returns a strategy that always responds with the given static response or error. */
export function strategyStatic(response: Response | Error): Strategy;

/** Returns a partition strategy for HTML with URL rewriting. */
export function strategyHTMLPartition(options?: PartitionOptions): Strategy;

/** Returns a partition strategy that streams multiple sub-responses. */
export function strategyPartition(options?: PartitionOptions): Strategy;
