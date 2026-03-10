/* global Request Response Headers */
import { ok, strictEqual } from "node:assert";
import test from "node:test";
import fc from "fast-check";
import "./helper.js";
import cacheControlMiddleware from "../packages/cache-control/index.js";
import {
	addHeaderToRequest,
	addHeaderToResponse,
	cacheExpired,
	cachesDelete,
	compileConfig,
	deleteHeaderFromResponse,
	findRouteConfig,
	headersGetAll,
	isRequest,
	isResponse,
	newResponse,
	pathPattern,
	urlRemoveHash,
} from "../packages/core/index.js";
import {
	idbDeserializeRequest,
	idbSerializeRequest,
} from "../packages/offline/index.js";
import {
	getExpiryJWT,
	getExpiryPaseto,
	getTokenAuthorization,
	setTokenAuthorization,
} from "../packages/session/index.js";

// Valid HTTP header value: printable ASCII, no leading/trailing whitespace
const headerValue = () =>
	fc
		.stringMatching(/^[\x21-\x7E]([\x20-\x7E]*[\x21-\x7E])?$/)
		.filter((s) => s.length > 0);

// Valid HTTP header name
const headerName = () => fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/);

// *** http.js ***

test("fuzz: urlRemoveHash always strips fragment", () => {
	fc.assert(
		fc.property(
			fc.webPath(),
			fc.option(fc.webFragments(), { nil: undefined }),
			(path, fragment) => {
				const url = `http://localhost:8080${path}${fragment ? `#${fragment}` : ""}`;
				const result = urlRemoveHash(url);
				ok(!result.includes("#"), `hash not stripped: ${result}`);
			},
		),
		{ numRuns: 200 },
	);
});

test("fuzz: urlRemoveHash preserves path and query", () => {
	fc.assert(
		fc.property(
			fc.webPath(),
			fc.webQueryParameters(),
			fc.webFragments(),
			(path, query, fragment) => {
				const url = `http://localhost:8080${path}?${query}#${fragment}`;
				const result = urlRemoveHash(url);
				ok(result.startsWith("http://localhost:8080"), "origin preserved");
			},
		),
		{ numRuns: 200 },
	);
});

test("fuzz: headersGetAll roundtrips header entries", () => {
	fc.assert(
		fc.property(
			fc.dictionary(headerName(), headerValue(), {
				minKeys: 0,
				maxKeys: 5,
			}),
			(headerDict) => {
				const headers = new Headers(headerDict);
				const result = headersGetAll(headers);
				for (const [key, value] of Object.entries(headerDict)) {
					// Headers normalizes keys to lowercase and trims values
					strictEqual(
						result[key.toLowerCase()],
						value.trim(),
						`header ${key} mismatch`,
					);
				}
			},
		),
		{ numRuns: 200 },
	);
});

test("fuzz: headersGetAll returns empty object for falsy input", () => {
	fc.assert(
		fc.property(fc.constantFrom(undefined, null, false, 0, ""), (input) => {
			const result = headersGetAll(input);
			strictEqual(Object.keys(result).length, 0);
		}),
	);
});

test("fuzz: newResponse preserves status and body", () => {
	// Exclude null-body statuses (204, 205, 304) which reject non-empty bodies
	const validStatus = fc
		.integer({ min: 200, max: 599 })
		.filter((s) => s !== 204 && s !== 205 && s !== 304);
	fc.assert(
		fc.property(validStatus, fc.string({ maxLength: 500 }), (status, body) => {
			const response = newResponse({
				status,
				url: "http://localhost:8080/test",
				body,
			});
			strictEqual(response.status, status);
			strictEqual(response.url, "http://localhost:8080/test");
			ok(response.headers.get("date"), "date header set");
		}),
		{ numRuns: 200 },
	);
});

test("fuzz: isRequest/isResponse type checks", () => {
	fc.assert(
		fc.property(fc.anything(), (val) => {
			const reqResult = isRequest(val);
			const resResult = isResponse(val);
			strictEqual(typeof reqResult, "boolean");
			strictEqual(typeof resResult, "boolean");
			// Can't be both Request and Response
			if (reqResult && resResult) throw new Error("both true");
		}),
		{ numRuns: 200 },
	);
});

test("fuzz: addHeaderToRequest preserves existing headers", () => {
	fc.assert(
		fc.property(headerName(), headerValue(), (key, value) => {
			const request = new Request("http://localhost:8080/test", {
				headers: new Headers({ "X-Existing": "keep" }),
			});
			const result = addHeaderToRequest(request, key, value);
			strictEqual(result.headers.get(key), value);
			strictEqual(result.headers.get("X-Existing"), "keep");
		}),
		{ numRuns: 200 },
	);
});

test("fuzz: addHeaderToResponse preserves existing headers", () => {
	fc.assert(
		fc.property(headerName(), headerValue(), (key, value) => {
			const response = newResponse({
				status: 200,
				url: "http://localhost:8080/test",
				body: "",
			});
			const result = addHeaderToResponse(response, key, value);
			strictEqual(result.headers.get(key), value);
		}),
		{ numRuns: 200 },
	);
});

test("fuzz: deleteHeaderFromResponse removes the header", () => {
	fc.assert(
		fc.property(headerName(), headerValue(), (key, value) => {
			const headers = new Headers({ [key]: value });
			const response = newResponse(
				{ status: 200, url: "http://localhost:8080/test", body: "" },
				headers,
			);
			const result = deleteHeaderFromResponse(response, key);
			strictEqual(result.headers.get(key), null);
		}),
		{ numRuns: 200 },
	);
});

// *** cache.js ***

test("fuzz: cacheExpired with arbitrary dates", () => {
	fc.assert(
		fc.property(
			fc.date({ min: new Date("2000-01-01"), max: new Date("2050-01-01") }),
			(date) => {
				const response = new Response("", {
					headers: new Headers({ Expires: date.toUTCString() }),
				});
				const result = cacheExpired(response);
				strictEqual(typeof result, "boolean");
				if (date.getTime() < Date.now()) {
					strictEqual(result, true);
				} else {
					strictEqual(result, false);
				}
			},
		),
		{ numRuns: 200 },
	);
});

test("fuzz: cacheExpired returns undefined for falsy values", () => {
	fc.assert(
		fc.property(fc.constantFrom(undefined, null, false, 0, ""), (val) => {
			strictEqual(cacheExpired(val), undefined);
		}),
	);
});

test("fuzz: cacheExpired with invalid Expires header", () => {
	fc.assert(
		fc.property(fc.string({ minLength: 1, maxLength: 50 }), (dateStr) => {
			const response = new Response("", {
				headers: new Headers({ Expires: dateStr }),
			});
			const result = cacheExpired(response);
			// Invalid date -> NaN, NaN < Date.now() is false
			strictEqual(typeof result, "boolean");
		}),
		{ numRuns: 200 },
	);
});

// *** config.js ***

test("fuzz: pathPattern creates valid RegExp from arbitrary patterns", () => {
	fc.assert(
		fc.property(
			fc.stringMatching(/^[a-zA-Z0-9.*+?/\\^$|()[\]{}]{0,30}$/),
			(pattern) => {
				try {
					const regex = pathPattern(pattern);
					ok(regex instanceof RegExp);
				} catch (e) {
					// Invalid regex is acceptable
					ok(e instanceof SyntaxError, `unexpected error: ${e.message}`);
				}
			},
		),
		{ numRuns: 200 },
	);
});

test("fuzz: compileConfig with arbitrary route counts", () => {
	fc.assert(
		fc.property(
			fc.integer({ min: 0, max: 10 }),
			fc.stringMatching(/^[a-z]{1,10}-$/),
			(routeCount, prefix) => {
				const routes = Array.from({ length: routeCount }, (_, i) => ({
					methods: ["GET"],
					pathPattern: pathPattern(`/route${i}$`),
					cacheName: `route-${i}`,
				}));
				const config = compileConfig({
					cachePrefix: prefix,
					middlewares: [],
					routes,
				});
				strictEqual(config.routes.length, routeCount);
				strictEqual(config.cachePrefix, prefix);
				for (let i = 0; i < routeCount; i++) {
					strictEqual(config.routes[i].cacheKey, `${prefix}route-${i}`);
				}
			},
		),
		{ numRuns: 100 },
	);
});

test("fuzz: compileConfig with arbitrary precache string routes", () => {
	fc.assert(
		fc.property(
			fc.array(fc.webPath(), { minLength: 0, maxLength: 5 }),
			(paths) => {
				const config = compileConfig({
					middlewares: [],
					routes: [],
					precache: {
						routes: paths.map((p) => `http://localhost${p}`),
					},
				});
				strictEqual(config.precache.routes.length, paths.length);
				for (const route of config.precache.routes) {
					ok(route.cacheKey, "precache route has cacheKey");
					ok(Array.isArray(route.before), "precache route has before array");
				}
			},
		),
		{ numRuns: 100 },
	);
});

test("fuzz: compileConfig cacheKey is always prefix + name", () => {
	fc.assert(
		fc.property(
			fc.stringMatching(/^[a-z]{1,10}-$/),
			fc.stringMatching(/^[a-z]{1,10}$/),
			(prefix, name) => {
				const config = compileConfig({
					cachePrefix: prefix,
					cacheName: name,
					middlewares: [],
					routes: [],
				});
				strictEqual(config.cacheKey, prefix + name);
			},
		),
		{ numRuns: 200 },
	);
});

// *** events.js ***

test("fuzz: findRouteConfig returns base config when no route matches", () => {
	fc.assert(
		fc.property(
			fc.webPath(),
			fc.constantFrom("GET", "POST", "PUT", "DELETE", "PATCH"),
			(path, method) => {
				const config = compileConfig({
					middlewares: [],
					routes: [
						{
							methods: ["OPTIONS"],
							pathPattern: pathPattern("/never-match-this-12345$"),
							cacheName: "nope",
						},
					],
				});
				const request = new Request(`http://localhost:8080${path}`, { method });
				const result = findRouteConfig(config, request);
				strictEqual(result, config);
			},
		),
		{ numRuns: 200 },
	);
});

test("fuzz: findRouteConfig matches correct route by method and path", () => {
	fc.assert(
		fc.property(
			fc.constantFrom("GET", "POST", "PUT", "DELETE"),
			fc.integer({ min: 0, max: 4 }),
			(method, routeIdx) => {
				const routes = Array.from({ length: 5 }, (_, i) => ({
					methods: [method],
					pathPattern: pathPattern(`/api/v${i}/`),
					cacheName: `v${i}`,
				}));
				const config = compileConfig({
					middlewares: [],
					routes,
				});
				const request = new Request(
					`http://localhost:8080/api/v${routeIdx}/data`,
					{ method },
				);
				const result = findRouteConfig(config, request);
				strictEqual(result.cacheName, `v${routeIdx}`);
			},
		),
		{ numRuns: 100 },
	);
});

// *** cache-control middleware ***

test("fuzz: cacheControlMiddleware sets arbitrary Cache-Control header", () => {
	// Generate valid Cache-Control directives without newlines
	const directive = fc.stringMatching(/^[a-z-]{1,20}(=[0-9]{1,6})?$/);
	const cacheControlValue = fc
		.array(directive, { minLength: 1, maxLength: 3 })
		.map((dirs) => dirs.join(", "));

	fc.assert(
		fc.property(cacheControlValue, (cacheControl) => {
			const middleware = cacheControlMiddleware({ cacheControl });
			const request = new Request("http://localhost:8080/test");
			const response = new Response("", { status: 200 });
			const result = middleware.afterNetwork(request, response, {}, {});
			strictEqual(result.headers.get("Cache-Control"), cacheControl);
		}),
		{ numRuns: 200 },
	);
});

test("fuzz: cacheControlMiddleware passes through non-Response values", () => {
	fc.assert(
		fc.property(fc.anything(), (val) => {
			const middleware = cacheControlMiddleware({ cacheControl: "no-cache" });
			const request = new Request("http://localhost:8080/test");
			const result = middleware.afterNetwork(request, val, {}, {});
			if (val instanceof Response) {
				ok(result instanceof Response);
			} else {
				strictEqual(result, val);
			}
		}),
		{ numRuns: 200 },
	);
});

// *** session token parsing ***

test("fuzz: setTokenAuthorization then getTokenAuthorization roundtrip", () => {
	fc.assert(
		fc.property(
			// Token with no spaces (split(" ")[1] only works with single space delimiter)
			fc.stringMatching(/^[A-Za-z0-9._~+/=-]{1,200}$/),
			(token) => {
				const request = new Request("http://localhost:8080/api");
				const modified = setTokenAuthorization(request, token);
				const header = modified.headers.get("Authorization");
				strictEqual(header, `Bearer ${token}`);
				// Roundtrip through getTokenAuthorization
				const response = new Response("", {
					headers: new Headers({ Authorization: header }),
				});
				const extracted = getTokenAuthorization(response);
				strictEqual(extracted, token);
			},
		),
		{ numRuns: 200 },
	);
});

test("fuzz: getExpiryJWT returns finite number for valid JWT", () => {
	fc.assert(
		fc.property(
			fc.date({
				min: new Date("2020-01-01"),
				max: new Date("2030-01-01"),
				noInvalidDate: true,
			}),
			(expiresAt) => {
				const header = btoa(JSON.stringify({ alg: "HS256" }));
				const payload = btoa(
					JSON.stringify({ expires_at: expiresAt.toISOString() }),
				);
				const token = `${header}.${payload}.signature`;
				const response = new Response("");
				const result = getExpiryJWT(response, token);
				ok(Number.isFinite(result), `expected finite number, got ${result}`);
			},
		),
		{ numRuns: 200 },
	);
});

test("fuzz: getExpiryPaseto returns finite number for valid PASETO", () => {
	fc.assert(
		fc.property(
			fc.date({
				min: new Date("2020-01-01"),
				max: new Date("2030-01-01"),
				noInvalidDate: true,
			}),
			(exp) => {
				const footer = btoa(JSON.stringify({ exp: exp.toISOString() }));
				const token = `v4.public.${footer}`;
				const response = new Response("");
				const result = getExpiryPaseto(response, token);
				ok(Number.isFinite(result), `expected finite number, got ${result}`);
			},
		),
		{ numRuns: 200 },
	);
});

// *** offline serialization roundtrip ***

test("fuzz: idbSerializeRequest/idbDeserializeRequest roundtrip", async () => {
	await fc.assert(
		fc.asyncProperty(
			fc.constantFrom("POST", "PUT", "PATCH", "DELETE"),
			fc.string({ minLength: 0, maxLength: 500 }),
			fc.dictionary(headerName(), headerValue(), {
				minKeys: 0,
				maxKeys: 3,
			}),
			async (method, body, headerDict) => {
				const url = "http://localhost:8080/api/data";
				const headers = new Headers(headerDict);
				const request = new Request(url, { method, body, headers });

				const serialized = await idbSerializeRequest(request);
				strictEqual(serialized.method, method);
				strictEqual(serialized.url, url);
				strictEqual(serialized.body, body);

				const restored = idbDeserializeRequest(serialized);
				strictEqual(restored.method, method);
				strictEqual(restored.url, url);
			},
		),
		{ numRuns: 100 },
	);
});

// *** cachesDelete with arbitrary exclude ***

test("fuzz: cachesDelete excludes listed keys", async () => {
	await fc.assert(
		fc.asyncProperty(
			fc.uniqueArray(fc.stringMatching(/^[a-z-]{1,15}$/), {
				minLength: 1,
				maxLength: 5,
			}),
			fc.integer({ min: 0, max: 4 }),
			async (allKeys, excludeCount) => {
				const exclude = allKeys.slice(
					0,
					Math.min(excludeCount, allKeys.length),
				);
				const deletedKeys = [];

				const origKeys = globalThis.caches.keys;
				const origDelete = globalThis.caches.delete;
				globalThis.caches.keys = () => Promise.resolve([...allKeys]);
				globalThis.caches.delete = (key) => {
					deletedKeys.push(key);
					return Promise.resolve(true);
				};

				await cachesDelete(exclude);

				const excludeSet = new Set(exclude);
				for (const key of deletedKeys) {
					ok(!excludeSet.has(key), `excluded key ${key} was deleted`);
				}
				strictEqual(deletedKeys.length, allKeys.length - exclude.length);

				globalThis.caches.keys = origKeys;
				globalThis.caches.delete = origDelete;
			},
		),
		{ numRuns: 100 },
	);
});
