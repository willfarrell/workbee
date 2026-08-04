// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT

// Extracts a precache route manifest from a JSON response, for use as
// `precache.extract` in `@work-bee/core`. Core deliberately ships no default:
// the manifest format is an application concern, so the parser is a plugin.
export const precacheExtractJSON = async (response) => {
	const rawContentType = response.headers.get("Content-Type");
	// Stryker disable next-line StringLiteral: this `?? ""` fallback is only used
	// when the Content-Type header is absent. The fallback string is fed straight
	// into `.startsWith("application/json")`, which is false for "" and for any
	// other non-JSON literal (e.g. Stryker's sentinel) alike, so the function
	// returns [] either way — no observable difference. (The "Content-Type" arg
	// mutation lives on the line above and is killed by the parse-success tests.)
	const contentType = rawContentType ?? "";
	if (
		!contentType
			.split(";")[0]
			.trim()
			.toLowerCase()
			.startsWith("application/json")
	)
		return [];
	const parsed = await response.json();
	if (!Array.isArray(parsed)) {
		throw new TypeError(
			"precacheExtractJSON: expected an array of routes, received " +
				(parsed === null ? "null" : typeof parsed),
		);
	}
	return parsed;
};

export default precacheExtractJSON;
