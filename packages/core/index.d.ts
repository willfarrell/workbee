// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
// --- Interfaces ---

/** Strategy function signature for handling fetch requests. */
export type Strategy = (
	request: Request,
	event: ExtendableEvent,
	config: RouteConfig,
) => Promise<Response>;

/** Middleware applied before the strategy executes. */
export type BeforeMiddleware = (
	request: Request,
	event: ExtendableEvent,
	config: RouteConfig,
) => Request | Promise<Request>;

/** Middleware applied after the strategy executes. */
export type AfterMiddleware = (
	request: Request,
	/** `undefined` when a cache-only lookup missed. */
	response: Response | Error | undefined,
	event: ExtendableEvent,
	config: RouteConfig,
) => Response | Error | Promise<Response | Error>;

/** Middleware object with optional lifecycle hooks; `false` disables a hook. */
export interface Middleware {
	before?: BeforeMiddleware | false;
	beforeNetwork?: BeforeMiddleware | false;
	afterNetwork?: AfterMiddleware | false;
	after?: AfterMiddleware | false;
}

/** Configuration for an individual route. */
export interface RouteConfig {
	cacheKey: string;
	cachePrefix: string;
	cacheName: string;
	methods: string[];
	strategy: Strategy;
	/** Absent on path-only (sub-request) routes, which never match fetches. */
	pathPattern?: RegExp;
	/** Sub-request path (strategyPartition) or precache URL. */
	path?: string;
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
	/** Call skipWaiting() on install. Default: true. */
	skipWaiting?: boolean;
	/**
	 * When true (and the top-level config is the bare network proxy — default
	 * strategy with no middlewares), unmatched requests skip respondWith so the
	 * browser handles them natively. Resolved by compileConfig. Default: true.
	 */
	passthrough: boolean;
}

export interface PrecacheConfig extends RouteConfig {
	routes: (PrecacheRouteConfig | string)[];
	eventType: string | false;
	postMessage: (
		message: { type: string } & Record<string, unknown>,
	) => Promise<void>;
	extract?: (response: Response) => unknown[] | Promise<unknown[]>;
}

export interface PrecacheRouteConfig extends RouteConfig {
	path: string;
}

export interface ActivateConfig {
	eventType: string | false;
	postMessage: (
		message: { type: string } & Record<string, unknown>,
	) => Promise<void>;
	/**
	 * Extra cache-name prefixes activate may purge, e.g. `["sw-"]` when
	 * cachePrefix is versioned (`"sw-2-"`). Caches under any configured
	 * cachePrefix are always eligible; all other caches are never touched.
	 */
	purgePrefixes: string[];
}

/** Options for partition strategies. Pass routes through compileConfig. */
export interface PartitionOptions {
	routes: RouteConfig[];
	makeRequest?: (
		request: Request,
		config: RouteConfig,
		routeConfig: RouteConfig,
	) => Request;
	/** Composite headers; when omitted, inherited from the first sub-response. */
	headers?: HeadersInit;
}

// --- lib/cache.js ---

/**
 * Returns `response` with an Expires header of now + (max-age - current age),
 * where current age is max(Age, now - Date) (RFC 9111 §4.2.3; s-maxage is
 * ignored: a ServiceWorker cache is private). Already stale: Expires removed.
 * max-age overrides an existing Expires; without max-age the response is
 * returned unchanged.
 */
export function applyExpires(response: Response): Response;

/** Resolves a Response from the named cache (undefined if absent). */
export function cacheMatch(
	cacheKey: string,
	request: Request,
): Promise<Response | undefined>;

/**
 * Returns a handler that overrides cached responses via postMessage events.
 * `allowedOrigins` is required (non-empty string[]); the handler silently
 * drops any MessageEvent whose source origin isn't in the list. A
 * ServiceWorker only receives messages from same-origin clients, so this does
 * not protect against script running on your own origin (e.g. XSS).
 */
export function cacheOverrideEvent(
	config: WorkBeeConfig,
	options: { allowedOrigins: string[] },
): (
	messageEvent:
		| ExtendableMessageEvent
		| {
				source?: { url?: string } | null;
				data?: {
					request: string | Request;
					response: string | Response;
					/** Headers for a string `response`, e.g. Content-Type. */
					headers?: Record<string, string>;
				};
				waitUntil?: (promise: Promise<unknown>) => void;
		  },
) => Promise<void> | undefined;

/** Puts a response into the named cache, retrying on quota errors. */
export function cachePut(
	cacheKey: string,
	request: Request,
	response: Response,
	retry?: number,
): Promise<void>;

/**
 * Returns whether the response's Expires header is in the past (an invalid
 * date counts as past), or undefined if no response.
 */
export function cacheExpired(
	response: Response | undefined,
): boolean | undefined;

/** Deletes expired entries from a specific cache. */
export function cacheDeleteExpired(cacheKey: string): Promise<void>;

/** Deletes expired entries from all caches. */
export function cachesDeleteExpired(): Promise<PromiseSettledResult<void>[]>;

/** Deletes caches starting with one of `prefixes` (default: all), except `exclude`. */
export function cachesDelete(
	exclude?: string[],
	prefixes?: string[],
): Promise<boolean[]>;

// --- lib/config.js ---

/** Converts a path pattern string to a RegExp. */
export function pathPattern(pathPattern: string): RegExp;

/** Default configuration values (frozen, uncompiled). */
export const defaultConfig: Readonly<UserConfig>;

/**
 * User-facing input type for `compileConfig`. Only exposes fields the user is
 * expected to provide; the internal flattened `before`/`after`/`cacheKey`
 * arrays are computed by `compileConfig` and should not be supplied directly.
 */
export interface UserRouteConfig {
	cachePrefix?: string;
	cacheName?: string;
	methods?: string[];
	strategy?: Strategy;
	/** Required unless `path` is set (path-only routes never match fetches). */
	pathPattern?: RegExp;
	/** Sub-request path for strategyPartition routes. */
	path?: string;
	middlewares?: Middleware[];
}

export interface UserPrecacheConfig extends UserRouteConfig {
	routes?: (UserPrecacheRouteConfig | string)[] | string;
	eventType?: string | false;
	postMessage?: (
		message: { type: string } & Record<string, unknown>,
	) => Promise<void>;
	extract?: (response: Response) => unknown[] | Promise<unknown[]>;
}

export interface UserPrecacheRouteConfig extends UserRouteConfig {
	path: string;
}

export interface UserConfig extends UserRouteConfig {
	precache?: UserPrecacheConfig;
	activate?: Partial<ActivateConfig>;
	routes?: UserRouteConfig[];
	skipWaiting?: boolean;
	/** Allow unmatched requests to bypass respondWith. Default: true. */
	passthrough?: boolean;
}

/** Compiles a user-provided configuration into a fully resolved WorkBeeConfig. */
export function compileConfig(config: UserConfig): WorkBeeConfig;

/**
 * Compiles a single route definition against a parent route-like config.
 * Exposed so event handlers (e.g. a precache loader that fetches route
 * configs from JSON) can produce fully-flattened `RouteConfig`s without
 * re-running the full `compileConfig` pipeline.
 */
export function compileRoute(
	parent: RouteConfig,
	raw: UserPrecacheRouteConfig | string,
): RouteConfig;

/** Keys inherited from a parent route/config into a child route. */
export const routeInheritKeys: readonly [
	"cachePrefix",
	"cacheName",
	"methods",
	"strategy",
	"middlewares",
];

/** Returns a shallow copy of `originalObject` containing only the requested keys (skipping undefined). */
export function pick<T extends object>(
	originalObject: T | undefined,
	keysToPick: readonly (keyof T | string)[],
): Partial<T>;

/**
 * Flattens `middlewares[]` on a partial route config into per-phase arrays
 * (`before`, `beforeNetwork`, `afterNetwork`, `after`) and derives `cacheKey`.
 * Mutates and returns the same object.
 */
export function resolveMiddlewares(cfg: Partial<RouteConfig>): RouteConfig;

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

/**
 * Fetches using a strategy, then awaits any waitUntil work it registered.
 * Resolves the strategy's `Response | Error`; rejects if a waitUntil promise
 * rejects.
 */
export function fetchInlineStrategy(
	request: Request,
	event: ExtendableEvent,
	config: RouteConfig,
): Promise<Response | Error>;

/** Fetches using the configured strategy with before/after middleware. */
export function fetchStrategy(
	request: Request,
	event: ExtendableEvent,
	config: RouteConfig,
): Promise<Response | Error>;

/**
 * Handles backgroundfetchsuccess: stores every record in the cache of the
 * route it matches, then posts `{ stored: true }` on a BroadcastChannel named
 * after the registration id.
 */
export function backgroundFetchSuccessEvent(
	event: Event,
	config: WorkBeeConfig,
): void;

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

/**
 * Creates a new Response with optional status, statusText, body, and headers.
 * Per the Fetch spec `Response.url` is readonly and is "" for synthesized
 * responses — callers that need a URL-bearing Response should use the Cache
 * API (Cache.match returns responses with .url set by the request key).
 */
export function newResponse(
	options: {
		status?: number;
		statusText?: string;
		body?: BodyInit | null;
	},
	headersObj?: HeadersInit,
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

export const postMethod: "POST";
export const putMethod: "PUT";
export const patchMethod: "PATCH";
export const deleteMethod: "DELETE";

export const authorizationHeader: "Authorization";

// --- lib/postMessage.js ---

/** Posts a message to all controlled window clients. */
export function postMessageToAll(message: any): Promise<void>;

/** Posts a message to the focused window client, or the first available. */
export function postMessageToFocused(message: any): Promise<void>;

// --- lib/strategies.js ---

/**
 * Stale-if-error strategy: tries the network, caches successful responses
 * gated by Cache-Control max-age, and on a thrown error or 5xx response
 * falls back to any cached copy (even expired). Throws the original error
 * only when both network and cache fail.
 */
export const strategyStaleIfError: Strategy;

/** Network-only strategy: always fetches from the network. */
export const strategyNetworkOnly: Strategy;

/** Cache-only strategy: only returns cached responses. */
export const strategyCacheOnly: Strategy;

/**
 * Precache default: fetches and stores 2xx GET responses whatever their
 * freshness (freshness is owned by the SW version). Not stored: 206,
 * `Vary: *`, `Vary` on Authorization/Cookie, `Cache-Control: no-store`.
 */
export const strategyPrecache: Strategy;

/** Network-first strategy: tries network, falls back to cache. */
export const strategyNetworkFirst: Strategy;

/** Cache-first strategy: tries cache, falls back to network. */
export const strategyCacheFirst: Strategy;

/** Stale-while-revalidate strategy: returns cache and revalidates in background. */
export const strategyStaleWhileRevalidate: Strategy;

/** Ignore strategy: returns a 504 response. */
export const strategyIgnore: Strategy;

/** Cache-first-ignore strategy: tries cache, returns 504 if not cached. */
export const strategyCacheFirstIgnore: Strategy;

/**
 * Returns a strategy that always responds with the given static Response, or
 * throws the given Error so error-path middleware runs.
 */
export function strategyStatic(response: Response | Error): Strategy;

/**
 * Returns a partition strategy for HTML with URL rewriting. Sub-requests
 * preserve the original request's method and headers; the request body is
 * NOT forwarded (typical HTML partition flows are GET/HEAD only).
 */
export function strategyHTMLPartition(options?: PartitionOptions): Strategy;

/**
 * Returns a partition strategy that streams multiple sub-responses. Without
 * `options.headers` the composite takes the first sub-response's headers,
 * status and statusText; with them it is a 200.
 */
export function strategyPartition(options?: PartitionOptions): Strategy;
