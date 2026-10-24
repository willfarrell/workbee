// Copyright 2026 will Farrell, and workbee contributors.
// SPDX-License-Identifier: MIT
interface InactivityClientOptions {
	/** Minutes without activity before `inactivityEvent` runs. Default 15. */
	inactivityAllowedInMin?: number;
	inactivityEvent?: () => void;
	/** DOM events that count as activity. */
	events?: string[];
}

/** Starts the page-side inactivity countdown; returns a cleanup function. */
declare function inactivityClient(opts?: InactivityClientOptions): () => void;

export default inactivityClient;
