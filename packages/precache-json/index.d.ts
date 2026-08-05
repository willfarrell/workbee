// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT

/**
 * Extracts a precache route manifest from a JSON response.
 *
 * Returns `[]` when the response is not `application/json`. Throws a
 * `TypeError` when the body parses to something other than an array.
 *
 * Intended as `precache.extract` for `@work-bee/core`.
 */
export function precacheExtractJSON(response: Response): Promise<any[]>;

export default precacheExtractJSON;
