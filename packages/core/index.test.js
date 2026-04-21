import { ok } from "node:assert";
import { test } from "node:test";

import * as core from "./index.js";

// cache.js
test("core: exports cache utilities", () => {
	ok("openCaches" in core);
	ok("cacheOverrideEvent" in core);
	ok("cachePut" in core);
	ok("cacheExpired" in core);
	ok("cacheDeleteExpired" in core);
	ok("cachesDeleteExpired" in core);
	ok("cachesDelete" in core);
});

// config.js
test("core: exports config utilities", () => {
	ok("pathPattern" in core);
	ok("defaultConfig" in core);
	ok("compileConfig" in core);
});

// console.js
test("core: exports console utilities", () => {
	ok("consoleLog" in core);
	ok("consoleError" in core);
});

// events.js
test("core: exports event utilities", () => {
	ok("eventInstall" in core);
	ok("precacheExtractJSON" in core);
	ok("eventActivate" in core);
	ok("eventFetch" in core);
	ok("findRouteConfig" in core);
	ok("fetchInlineStrategy" in core);
	ok("fetchStrategy" in core);
	ok("backgroundFetchSuccessEvent" in core);
	ok("backgroundFetchFailEvent" in core);
});

// http.js
test("core: exports http utilities", () => {
	ok("headersGetAll" in core);
	ok("urlRemoveHash" in core);
	ok("isRequest" in core);
	ok("newRequest" in core);
	ok("addHeaderToRequest" in core);
	ok("isResponse" in core);
	ok("newResponse" in core);
	ok("addHeaderToResponse" in core);
	ok("deleteHeaderFromResponse" in core);
	ok("getMethod" in core);
	ok("postMethod" in core);
	ok("putMethod" in core);
	ok("patchMethod" in core);
	ok("deleteMethod" in core);
	ok("headMethod" in core);
	ok("optionsMethod" in core);
	ok("authorizationHeader" in core);
});

// postMessage.js
test("core: exports postMessage utilities", () => {
	ok("postMessageToAll" in core);
	ok("postMessageToFocused" in core);
});

// strategies.js
test("core: exports strategy utilities", () => {
	ok("strategyNetworkOnly" in core);
	ok("strategyCacheOnly" in core);
	ok("strategyNetworkFirst" in core);
	ok("strategyCacheFirst" in core);
	ok("strategyStaleWhileRevalidate" in core);
	ok("strategyStaleIfError" in core);
	ok("strategyIgnore" in core);
	ok("strategyCacheFirstIgnore" in core);
	ok("strategyStatic" in core);
	ok("strategyHTMLPartition" in core);
	ok("strategyPartition" in core);
});
