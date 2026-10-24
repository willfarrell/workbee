// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
// Internal: not re-exported from index.js.

// A Vary on a credential can't be honoured: cachePut never stores credentials
// in the key, so an anonymous request would match the per-user entry.
const varyCredentialRegExp = /(?:^|[,\s])(?:authorization|cookie)(?:$|[,\s])/i;
// Token-boundary, case-insensitive Cache-Control directives (RFC 9111 §5.2).
const noStoreRegExp = /(?:^|[,\s])no-store(?:$|[,\s])/i;
export const noCacheRegExp = /(?:^|[,\s])no-cache(?:$|[,\s=])/i;

// Only GET: entries are keyed as a GET of the URL, so a POST/HEAD response
// would be served to later GETs. cache.put() rejects partial content and
// `Vary: *` (header names can't contain "*", so a substring check is exact).
export const cacheable = (request, response) => {
	// Stryker disable next-line StringLiteral: any fallback without "*" or a
	// credential token passes both checks below, exactly like "".
	const vary = response.headers.get("Vary") ?? "";
	return (
		request.method === "GET" &&
		response.ok &&
		response.status !== 206 &&
		!vary.includes("*") &&
		!varyCredentialRegExp.test(vary) &&
		!noStoreRegExp.test(response.headers.get("Cache-Control"))
	);
};
